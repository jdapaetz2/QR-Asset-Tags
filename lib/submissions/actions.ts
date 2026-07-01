"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { isSubmissionStatus } from "@/lib/submissions/display";

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
