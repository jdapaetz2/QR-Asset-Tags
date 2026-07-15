import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { isLikelyUuid } from "@/lib/rentals/evidence";
import { getSubmissionRecord } from "@/lib/submissions/detail-data";
import { collectMediaPaths, signMediaPaths } from "@/lib/submissions/media";
import { submissionTypeLabel } from "@/lib/submissions/origin";
import { submissionReference } from "@/lib/submissions/inbox";
import { belongsToScannedAsset } from "@/lib/staff/record-context";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/relative-time";
import { submissionStatusTone } from "@/lib/ui/status";
import { submissionStatusLabel } from "@/lib/ui/status-labels";
import { SubmissionDetailRecord } from "@/components/submissions/submission-detail-record";
import { StaffRecordFrame } from "@/components/staff/staff-record-frame";

export const dynamic = "force-dynamic";

/**
 * Thin staff wrapper (Wave 3N.3) — the SAME submission detail CONTENT, read-only, in the mobile staff shell
 * with a prominent "Back to staff asset" exit. Reuses the shared loader + shared `<SubmissionDetailRecord>`
 * (no forked submission/media/RLS logic). Status-change actions are admin chrome and are intentionally not
 * rendered here. Cross-org is blocked by RLS twice; the asset-id pairing check blocks a same-org cross-asset
 * combination. Related links stay inside the staff shell.
 */
export default async function StaffSubmissionPage({
  params,
}: {
  params: Promise<{ shortCode: string; submissionId: string }>;
}) {
  const { shortCode, submissionId } = await params;
  const { asset } = await requireStaffAssetByShortCode(shortCode);
  if (!isLikelyUuid(submissionId)) notFound();

  const supabase = await createClient();
  const record = await getSubmissionRecord(supabase, submissionId);
  // Not found / cross-org (RLS) → 404; a submission for a DIFFERENT asset than the scanned one → 404.
  if (!record || !belongsToScannedAsset(record.submission.asset_id, asset.id)) notFound();

  const { submission, related } = record;
  const signedByPath = await signMediaPaths(supabase, collectMediaPaths([submission]));
  const reference = submissionReference(submission.id, submission.created_at);

  return (
    <StaffRecordFrame
      shortCode={shortCode}
      assetId={asset.id}
      assetName={asset.asset_name}
      eyebrow="Submission record"
    >
      {/* Read-only identity band (no status-change controls in the staff view). */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {submissionTypeLabel(submission.form_type, submission.submission_origin)}
          </h1>
          <Badge tone={submissionStatusTone(submission.status)}>
            {submissionStatusLabel(submission.status)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">{reference}</span> ·{" "}
          <RelativeTime value={submission.created_at} />
        </p>
      </section>

      <SubmissionDetailRecord
        submission={submission}
        signedByPath={signedByPath}
        related={related}
        submissionHref={(id) => `/staff/t/${shortCode}/submissions/${id}`}
      />
    </StaffRecordFrame>
  );
}
