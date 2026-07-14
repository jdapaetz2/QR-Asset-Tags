"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId, requireProfile } from "@/lib/auth/session";
import { isSubmissionStatus } from "@/lib/submissions/display";
import { returnActionOutcome } from "@/lib/submissions/returns";
import { revalidateSubmissionSurfaces } from "@/lib/submissions/revalidate";
import {
  bulkResultMessage,
  limitBulkIds,
  partitionBulkResolve,
  type BulkResolveRow,
} from "@/lib/submissions/bulk";

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

  // Guard: an unresolved public/renter return whose asset is still Rented must NOT be resolved by an ordinary
  // Resolve — that would bypass the physical-return workflow (close session + free the asset). It must go through
  // "Mark returned & resolve" instead. RLS scopes every read/write to the caller's org.
  if (status === "resolved") {
    const { data: row } = await supabase
      .from("form_submissions")
      .select("form_type, submission_origin, asset_id, status")
      .eq("id", submissionId)
      .maybeSingle<{
        form_type: string;
        submission_origin: string | null;
        asset_id: string | null;
        status: string;
      }>();
    if (
      row &&
      row.form_type === "return_checklist" &&
      row.submission_origin !== "staff" &&
      (row.status === "new" || row.status === "reviewed") &&
      row.asset_id
    ) {
      const { count } = await supabase
        .from("asset_rental_sessions")
        .select("id", { count: "exact", head: true })
        .eq("asset_id", row.asset_id)
        .eq("status", "active");
      if ((count ?? 0) > 0) {
        return {
          error:
            "Use Mark returned & resolve — the asset still needs to be marked returned.",
        };
      }
    }
  }

  const { data, error } = await supabase
    .from("form_submissions")
    .update({ status })
    .eq("id", submissionId)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Could not update the status." };
  if (!data) return { error: "Submission not found." };

  // Bust the shared layout (nav badge) + inbox so the "new" count updates without a manual refresh.
  revalidateSubmissionSurfaces();

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

  revalidateSubmissionSurfaces();

  const base = safeRedirect(
    formData.get("redirect_to"),
    `/dashboard/submissions/${submissionId}`
  );
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}done=${outcome.done}`);
}

export type BulkStatusResult =
  | { ok: true; updated: number; skipped: number; message: string }
  | { ok: false; error: string };

/**
 * Bulk status update for the inbox multi-select (Phase 3C.4). One RLS-scoped request updates every selected
 * submission in the caller's org (`.in("id", …)` — cross-org / inaccessible ids simply match 0 rows and are
 * never touched); no service role. Ids are UUID-validated + capped (BULK_MAX). Bulk RESOLVE is safety-gated:
 * a public/renter return still tied to an active rental is SKIPPED (it must go through Mark returned & resolve),
 * so bulk actions can never bypass the physical-return workflow. Staff returns + damage/support resolve normally.
 * Returns updated/skipped counts + a human summary for the inline banner.
 */
export async function bulkSetSubmissionStatus(
  targetStatus: string,
  ids: string[]
): Promise<BulkStatusResult> {
  if (!isSubmissionStatus(targetStatus)) return { ok: false, error: "Invalid status." };

  await requireProfile();
  const { ids: validIds } = limitBulkIds(ids);
  if (validIds.length === 0) return { ok: false, error: "No valid submissions selected." };

  const supabase = await createClient();

  let eligibleIds = validIds;
  let skipped = 0;

  if (targetStatus === "resolved") {
    // Safety partition: hold back active renter returns. RLS scopes both reads to the caller's org.
    const { data: rowData } = await supabase
      .from("form_submissions")
      .select("id, form_type, submission_origin, status, asset_id")
      .in("id", validIds);
    const rows = (rowData ?? []) as BulkResolveRow[];

    const { data: sessionData } = await supabase
      .from("asset_rental_sessions")
      .select("asset_id")
      .eq("status", "active");
    const activeAssetIds = new Set(
      ((sessionData ?? []) as { asset_id: string | null }[])
        .map((s) => s.asset_id)
        .filter((id): id is string => Boolean(id))
    );

    const part = partitionBulkResolve(rows, activeAssetIds);
    eligibleIds = part.eligibleIds; // derived from RLS-visible rows → cross-org ids already excluded
    skipped = part.skippedActiveRenterReturn.length;
  }

  let updated = 0;
  if (eligibleIds.length > 0) {
    const { data: updatedRows, error } = await supabase
      .from("form_submissions")
      .update({ status: targetStatus })
      .in("id", eligibleIds)
      .select("id");
    if (error) return { ok: false, error: "Could not update the selected submissions." };
    updated = (updatedRows ?? []).length;
  }

  revalidateSubmissionSurfaces();
  return {
    ok: true,
    updated,
    skipped,
    message: bulkResultMessage({ targetStatus, updated, skipped }),
  };
}
