import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { submissionTypeLabel } from "@/lib/submissions/origin";
import { isInspectionFormType, returnChecklistFlags } from "@/lib/submissions/returns";
import { buildSessionEvidenceHref } from "@/lib/rentals/evidence";
import { openDamageHref } from "@/lib/submissions/damage";
import { sanitizeReturnTo, backHref } from "@/lib/nav/return-to";
import {
  mediaCount,
  submissionReference,
  submissionUrgency,
  urgencyTone,
} from "@/lib/submissions/inbox";
import { getSubmissionRecord } from "@/lib/submissions/detail-data";
import { collectMediaPaths, signMediaPaths } from "@/lib/submissions/media";
import { Badge } from "@/components/ui/badge";
import { AssetCodeChip } from "@/components/ui/asset-code-chip";
import { RelativeTime } from "@/components/relative-time";
import { submissionStatusTone } from "@/lib/ui/status";
import { submissionStatusLabel } from "@/lib/ui/status-labels";
import { SubmissionStatusActions } from "@/components/submissions/submission-status-actions";
import { MarkReturnedResolveButton } from "@/components/mark-returned-resolve-button";
import { ReturnDoneNotice } from "@/components/return-done-notice";
import { canQuickResolveReturn } from "@/lib/submissions/returns";
import { SubmissionDetailRecord } from "@/components/submissions/submission-detail-record";

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ done?: string; returnTo?: string }>;
}) {
  await requireOrgId();
  const { submissionId } = await params;
  const sp = await searchParams;
  // Originating (filtered) inbox URL to preserve on Back and after a status change (Wave 3N.2).
  const returnTo = sanitizeReturnTo(sp.returnTo) ?? undefined;

  const supabase = await createClient();

  // Shared loader (Wave 3N.3) — RLS-scoped; cross-org id → null → 404.
  const record = await getSubmissionRecord(supabase, submissionId);
  if (!record) notFound();
  const { submission, related, assetUnresolved, assetRented } = record;

  const reference = submissionReference(submission.id, submission.created_at);
  const urgency = submissionUrgency(submission.form_type, submission.submission_data_json);
  const attachmentCount = mediaCount(submission.media_urls);

  // Sign this submission's media once (shared helper) → the record derives its attachment list from the map.
  const signedByPath = await signMediaPaths(supabase, collectMediaPaths([submission]));

  const isDamageRelated =
    submission.form_type === "damage_report" ||
    (submission.form_type === "return_checklist" &&
      returnChecklistFlags(submission.submission_data_json).damage);

  const isInspection = isInspectionFormType(submission.form_type);
  const sessionEvidenceAvailable = Boolean(submission.rental_session_id) && isInspection;

  // Above-the-fold status controls (Phase 3C.4): an unresolved renter return whose asset is still Rented offers
  // "Mark returned & resolve" and hides the ordinary Resolve; staff returns use ordinary actions.
  const quickResolve = canQuickResolveReturn({
    formType: submission.form_type,
    status: submission.status,
    origin: submission.submission_origin,
    assetRented,
  });
  const detailHref = `/dashboard/submissions/${submission.id}`;
  // After a status change, return to the originating filtered inbox (refreshed) when known, else stay put.
  const afterAction = returnTo ?? detailHref;
  const statusActions = (
    <div className="flex flex-col gap-2 sm:items-end">
      {quickResolve ? (
        <MarkReturnedResolveButton submissionId={submission.id} redirectTo={afterAction} />
      ) : null}
      <SubmissionStatusActions
        submissionId={submission.id}
        status={submission.status}
        hideResolve={quickResolve}
        redirectTo={afterAction}
      />
    </div>
  );

  const headerBlock = (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <Link
        href={backHref(returnTo, "/dashboard/submissions")}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Submissions
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {submissionTypeLabel(submission.form_type, submission.submission_origin)}
            </h1>
            <Badge tone={submissionStatusTone(submission.status)}>
              {submissionStatusLabel(submission.status)}
            </Badge>
            {urgency ? (
              <Badge tone={urgencyTone(urgency)}>{titleCase(urgency)} urgency</Badge>
            ) : null}
            {attachmentCount > 0 ? (
              <Badge tone="neutral">
                📎 {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{reference}</span> ·{" "}
            <RelativeTime value={submission.created_at} />
          </p>
        </div>
        {statusActions}
      </div>
    </section>
  );

  // One compact asset/session context strip (Wave 3N.2).
  const assetContext = (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
      {submission.asset ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <AssetCodeChip code={submission.asset.asset_code} />
            <span className="font-medium">{submission.asset.asset_name}</span>
            {submission.asset_id ? (
              <span className="text-xs text-muted-foreground">
                {assetUnresolved} unresolved on this asset
              </span>
            ) : null}
          </div>
          {submission.asset_id ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/dashboard/assets/${submission.asset_id}`}
                className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
              >
                Asset detail →
              </Link>
              <Link
                href={`/dashboard/assets/${submission.asset_id}/timeline`}
                className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
              >
                Asset timeline →
              </Link>
              {sessionEvidenceAvailable ? (
                <Link
                  href={buildSessionEvidenceHref(submission.rental_session_id)}
                  className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  Session evidence →
                </Link>
              ) : null}
              <Link
                href={`/dashboard/submissions?asset_id=${submission.asset_id}`}
                className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
              >
                This asset&apos;s submissions →
              </Link>
              {isDamageRelated ? (
                <Link
                  href={openDamageHref(submission.asset_id)}
                  className="rounded-md border border-destructive/40 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  Other open damage →
                </Link>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground">No linked asset.</p>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <ReturnDoneNotice done={sp.done} />
      {headerBlock}
      {assetContext}
      <SubmissionDetailRecord
        submission={submission}
        signedByPath={signedByPath}
        related={related}
        submissionHref={(id) => `/dashboard/submissions/${id}`}
      />
    </div>
  );
}
