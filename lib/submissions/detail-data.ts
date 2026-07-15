import type { SupabaseClient } from "@supabase/supabase-js";

import { UNRESOLVED_STATUSES } from "@/lib/submissions/inbox";
import { normalizeOrigin, oppositeOrigin } from "@/lib/submissions/origin";

/**
 * Shared submission-detail loader (Wave 3N.3). The RLS-scoped read the admin submission page used inline —
 * now shared verbatim so the admin page and the thin staff submission wrapper never fork the query. A
 * cross-org id returns no row under RLS → `null` (→ 404 at the route). Signing is done separately by the
 * caller via `signMediaPaths` so this stays a pure data read.
 */

export type SubmissionDetailRow = {
  id: string;
  created_at: string;
  form_type: string;
  status: string;
  submission_origin: string | null;
  rental_session_id: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_by_phone: string | null;
  submission_data_json: unknown;
  media_urls: unknown;
  asset_id: string | null;
  asset: { asset_code: string; asset_name: string } | null;
};

export type RelatedSubmissionRow = {
  id: string;
  created_at: string;
  status: string;
  submitted_by_name: string | null;
  submission_data_json: unknown;
};

export type SubmissionRecord = {
  submission: SubmissionDetailRow;
  related: RelatedSubmissionRow[];
  relatedHeading: string;
  assetUnresolved: number;
  assetRented: boolean;
};

export async function getSubmissionRecord(
  supabase: SupabaseClient,
  submissionId: string
): Promise<SubmissionRecord | null> {
  // RLS-scoped: a submission from another organization isn't returned → null (→ 404).
  const { data } = await supabase
    .from("form_submissions")
    .select(
      "id, created_at, form_type, status, submission_origin, rental_session_id, submitted_by_name, submitted_by_email, submitted_by_phone, submission_data_json, media_urls, asset_id, asset:assets(asset_code, asset_name)"
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (!data) return null;
  const submission = data as unknown as SubmissionDetailRow;

  // Unresolved (new/reviewed) submissions on this asset + whether the asset is still actively rented.
  let assetUnresolved = 0;
  let assetRented = false;
  if (submission.asset_id) {
    const [{ count: unresolved }, { count: active }] = await Promise.all([
      supabase
        .from("form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("asset_id", submission.asset_id)
        .in("status", UNRESOLVED_STATUSES as readonly string[]),
      supabase
        .from("asset_rental_sessions")
        .select("id", { count: "exact", head: true })
        .eq("asset_id", submission.asset_id)
        .eq("status", "active"),
    ]);
    assetUnresolved = unresolved ?? 0;
    assetRented = (active ?? 0) > 0;
  }

  // Related records from the SAME rental session but the OPPOSITE workflow (staff return <-> renter return).
  const origin = normalizeOrigin(submission.submission_origin);
  const isStaff = origin === "staff";
  let related: RelatedSubmissionRow[] = [];
  if (submission.form_type === "return_checklist" && submission.rental_session_id) {
    const { data: rel } = await supabase
      .from("form_submissions")
      .select("id, created_at, status, submitted_by_name, submission_data_json")
      .eq("rental_session_id", submission.rental_session_id)
      .eq("form_type", "return_checklist")
      .eq("submission_origin", oppositeOrigin(origin))
      .neq("id", submission.id)
      .order("created_at", { ascending: false });
    related = (rel ?? []) as RelatedSubmissionRow[];
  }
  const relatedHeading = isStaff
    ? "Related renter return checklists"
    : "Related staff return checklist";

  return { submission, related, relatedHeading, assetUnresolved, assetRented };
}
