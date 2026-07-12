"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId, requireProfile } from "@/lib/auth/session";
import { isSubmissionStatus } from "@/lib/submissions/display";
import { returnActionOutcome } from "@/lib/submissions/returns";

export type SubmissionActionState = { error?: string };

/** Only allow same-app redirect targets (leading slash, no protocol/host). */
function safeRedirect(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === "string" && /^\/[^/]/.test(value) ? value : fallback;
}

/**
 * Update a submission's status. RLS (`form_submissions_rw`) limits this to the
 * caller's own organization — a cross-org id updates 0 rows. No service-role.
 *
 * On success it redirects back to `redirect_to` (a same-app path) when provided,
 * so the inbox list can update a row in place; otherwise it lands on the detail
 * page (the detail status form's existing behavior).
 */
export async function setSubmissionStatus(
  submissionId: string,
  _prev: SubmissionActionState,
  formData: FormData
): Promise<SubmissionActionState> {
  const status = formData.get("status");
  if (!isSubmissionStatus(status)) {
    return { error: "Invalid status." };
  }

  await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_submissions")
    .update({ status })
    .eq("id", submissionId)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Could not update the status." };
  if (!data) return { error: "Submission not found." };

  redirect(
    safeRedirect(
      formData.get("redirect_to"),
      `/dashboard/submissions/${submissionId}`
    )
  );
}

/**
 * "Mark returned & resolve" — the one admin action that completes a return checklist
 * atomically. All the work (close the active rental session, clear the asset's rental
 * pointer, resolve the submission) happens inside the `mark_return_and_resolve` RPC
 * (migration 0022), a single transaction, so there is no partial state and no separate
 * timeline write (the timeline is derived from the rows the RPC updates).
 *
 * `requireOrgId()` gates this to a signed-in member of an active org; the RPC re-checks
 * ownership (`organization_id = current_org_id()`) under RLS. It is idempotent — a second
 * click on an already-resolved checklist is a safe no-op. On success it redirects back to
 * `redirect_to` with a `?done=` flag so the caller shows the confirmation banner.
 */
export async function markReturnAndResolve(
  submissionId: string,
  _prev: SubmissionActionState,
  formData: FormData
): Promise<SubmissionActionState> {
  await requireOrgId();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_return_and_resolve", {
    p_submission_id: submissionId,
  });
  if (error) return { error: "Could not complete the return." };

  const outcome = returnActionOutcome(String(data ?? ""));
  if (!outcome.ok) return { error: outcome.error };

  const base = safeRedirect(
    formData.get("redirect_to"),
    `/dashboard/submissions/${submissionId}`
  );
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}done=${outcome.done}`);
}
