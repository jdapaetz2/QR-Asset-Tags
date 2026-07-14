import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { submissionFields } from "@/lib/submissions/display";
import {
  normalizeOrigin,
  oppositeOrigin,
  submissionTypeLabel,
} from "@/lib/submissions/origin";
import { returnChecklistFlags } from "@/lib/submissions/returns";
import { rentalEvidenceHref } from "@/lib/rentals/evidence";
import { openDamageHref } from "@/lib/submissions/damage";
import {
  UNRESOLVED_STATUSES,
  mediaCount,
  submissionReference,
  submissionUrgency,
  urgencyTone,
} from "@/lib/submissions/inbox";
import { Badge } from "@/components/ui/badge";
import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { RelativeTime } from "@/components/relative-time";
import { submissionStatusTone } from "@/lib/ui/status";
import { submissionStatusLabel } from "@/lib/ui/status-labels";
import { SubmissionStatusForm } from "@/components/submission-status-form";
import { MarkReturnedResolveButton } from "@/components/mark-returned-resolve-button";
import { ReturnDoneNotice } from "@/components/return-done-notice";
import { canQuickResolveReturn } from "@/lib/submissions/returns";
import {
  ReturnInspectionSummary,
  isReturnInspectionV2,
} from "@/components/submissions/return-inspection-summary";

const SUBMISSIONS_BUCKET = "submissions";

type SubmissionDetail = {
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

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  await requireOrgId();
  const { submissionId } = await params;
  const sp = await searchParams;

  const supabase = await createClient();

  // RLS-scoped: a submission from another organization isn't returned → 404.
  const { data } = await supabase
    .from("form_submissions")
    .select(
      "id, created_at, form_type, status, submission_origin, rental_session_id, submitted_by_name, submitted_by_email, submitted_by_phone, submission_data_json, media_urls, asset_id, asset:assets(asset_code, asset_name)"
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (!data) notFound();

  const submission = data as unknown as SubmissionDetail;
  const fields = submissionFields(
    submission.form_type,
    submission.submission_data_json
  );
  const reference = submissionReference(
    submission.id,
    submission.created_at
  );
  const urgency = submissionUrgency(
    submission.form_type,
    submission.submission_data_json
  );

  // Private bucket: generate short-lived signed URLs for this org's media. The
  // storage SELECT policy already restricts these to the caller's organization.
  const mediaPaths = Array.isArray(submission.media_urls)
    ? (submission.media_urls as string[])
    : [];
  const media = await Promise.all(
    mediaPaths.map(async (path) => {
      const { data: signed } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .createSignedUrl(path, 3600);
      return { path, url: signed?.signedUrl ?? null };
    })
  );
  const attachmentCount = mediaCount(submission.media_urls);

  // V2 guided return inspection → structured summary (photos grouped by slot); V1 → flat renderer.
  const v2Data = isReturnInspectionV2(submission.submission_data_json)
    ? submission.submission_data_json
    : null;
  const signedByPath = new Map(media.map((m) => [m.path, m.url]));

  // Unresolved (new/reviewed) submissions on this asset — includes this one if still open.
  // RLS-scoped; a small count query for the asset-context block.
  let assetUnresolved = 0;
  if (submission.asset_id) {
    const { count } = await supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", submission.asset_id)
      .in("status", UNRESOLVED_STATUSES as readonly string[]);
    assetUnresolved = count ?? 0;
  }

  // Whether the asset still has an active rental session (Phase 3C.2) — authoritative for the renter
  // quick action. One small RLS-scoped count query.
  let assetRented = false;
  if (submission.asset_id) {
    const { count } = await supabase
      .from("asset_rental_sessions")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", submission.asset_id)
      .eq("status", "active");
    assetRented = (count ?? 0) > 0;
  }

  const origin = normalizeOrigin(submission.submission_origin);
  const isStaff = origin === "staff";
  const isDamageRelated =
    submission.form_type === "damage_report" ||
    (submission.form_type === "return_checklist" &&
      returnChecklistFlags(submission.submission_data_json).damage);

  // Related records from the SAME rental session but the OPPOSITE workflow (staff return <-> renter return).
  // RLS-scoped (own org); never exposed publicly; same-session only (no cross-session links).
  type RelatedRow = {
    id: string;
    created_at: string;
    status: string;
    submitted_by_name: string | null;
    submission_data_json: unknown;
  };
  let related: RelatedRow[] = [];
  if (submission.form_type === "return_checklist" && submission.rental_session_id) {
    const { data: rel } = await supabase
      .from("form_submissions")
      .select("id, created_at, status, submitted_by_name, submission_data_json")
      .eq("rental_session_id", submission.rental_session_id)
      .eq("form_type", "return_checklist")
      .eq("submission_origin", oppositeOrigin(origin))
      .neq("id", submission.id)
      .order("created_at", { ascending: false });
    related = (rel ?? []) as RelatedRow[];
  }
  const relatedHeading = isStaff ? "Related renter return reports" : "Related staff return inspection";

  return (
    <div className="flex flex-col gap-6">
      <ReturnDoneNotice done={sp.done} />
      {/* Header */}
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
        <Link
          href="/dashboard/submissions"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Submissions
        </Link>
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
      </section>

      {/* Asset */}
      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-3 font-medium">Asset</h2>
        {submission.asset ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col items-start gap-1.5">
              <AssetTagChip code={submission.asset.asset_code} />
              <span className="font-medium">{submission.asset.asset_name}</span>
              {submission.asset_id ? (
                <span className="text-xs text-muted-foreground">
                  {assetUnresolved} unresolved submission
                  {assetUnresolved === 1 ? "" : "s"} on this asset
                </span>
              ) : null}
            </div>
            {submission.asset_id ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/submissions?asset_id=${submission.asset_id}`}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  This asset&apos;s submissions →
                </Link>
                <Link
                  href={`/dashboard/assets/${submission.asset_id}`}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  Asset detail →
                </Link>
                <Link
                  href={`/dashboard/assets/${submission.asset_id}/timeline`}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  Asset timeline →
                </Link>
                {submission.rental_session_id &&
                (submission.form_type === "return_checklist" ||
                  submission.form_type === "pre_use_inspection") ? (
                  <Link
                    href={rentalEvidenceHref(submission.rental_session_id)}
                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                  >
                    Session evidence →
                  </Link>
                ) : null}
                {isDamageRelated ? (
                  <Link
                    href={openDamageHref(submission.asset_id)}
                    className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                  >
                    Other open damage for this asset →
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground">No linked asset.</p>
        )}
      </section>

      {/* Status */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="text-sm">
          <h2 className="font-medium">Status</h2>
          <p className="text-muted-foreground">
            Set the workflow state as this submission is triaged and resolved.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canQuickResolveReturn({
            formType: submission.form_type,
            status: submission.status,
            origin: submission.submission_origin,
            assetRented,
          }) ? (
            <MarkReturnedResolveButton
              submissionId={submission.id}
              redirectTo={`/dashboard/submissions/${submission.id}`}
            />
          ) : null}
          <SubmissionStatusForm
            submissionId={submission.id}
            current={submission.status}
          />
        </div>
      </section>

      {/* Submitter / performer */}
      {isStaff ? (
        <section className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="mb-3 font-medium">Performed by</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-muted-foreground">
            <dt>Staff</dt>
            <dd className="text-foreground">{submission.submitted_by_name ?? "Staff"}</dd>
            {submission.submitted_by_email ? (
              <>
                <dt>Email</dt>
                <dd className="text-foreground">
                  <a
                    href={`mailto:${submission.submitted_by_email}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {submission.submitted_by_email}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Recorded from the authenticated staff account.
          </p>
        </section>
      ) : (
      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-3 font-medium">Submitted by</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-muted-foreground">
          <dt>Name</dt>
          <dd className="text-foreground">{submission.submitted_by_name ?? "—"}</dd>
          <dt>Email</dt>
          <dd className="text-foreground">
            {submission.submitted_by_email ? (
              <a
                href={`mailto:${submission.submitted_by_email}`}
                className="underline-offset-4 hover:underline"
              >
                {submission.submitted_by_email}
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt>Phone</dt>
          <dd className="text-foreground">
            {submission.submitted_by_phone ? (
              <a
                href={`tel:${submission.submitted_by_phone}`}
                className="underline-offset-4 hover:underline"
              >
                {submission.submitted_by_phone}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </dl>
      </section>
      )}

      {/* Related same-session records from the opposite workflow (staff <-> renter). */}
      {submission.form_type === "return_checklist" && submission.rental_session_id ? (
        <section className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="mb-3 font-medium">{relatedHeading}</h2>
          {related.length === 0 ? (
            <p className="text-muted-foreground">
              No {isStaff ? "renter return reports" : "staff return inspection"} for this rental.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {related.map((r) => {
                const flags = returnChecklistFlags(r.submission_data_json);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-muted-foreground">
                        {submissionReference(r.id, r.created_at)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <RelativeTime value={r.created_at} />
                        {r.submitted_by_name ? ` · ${r.submitted_by_name}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {flags.damage ? <Badge tone="danger">Damage</Badge> : null}
                      {flags.missing ? <Badge tone="warning">Missing</Badge> : null}
                      {!flags.flagged ? <Badge tone="success">No issues</Badge> : null}
                      <Link
                        href={`/dashboard/submissions/${r.id}`}
                        className="text-sm underline-offset-4 hover:underline"
                      >
                        Open {isStaff ? "report" : "inspection"} →
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {v2Data ? (
        /* V2 guided return inspection — structured summary + photos grouped by slot. */
        <ReturnInspectionSummary data={v2Data} signedByPath={signedByPath} />
      ) : (
        <>
          {/* Form-specific fields (V1 flat renderer) */}
          <section className="rounded-lg border bg-card p-4 text-sm">
            <h2 className="mb-3 font-medium">Details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-muted-foreground">
              {fields.map((field) => (
                <div key={field.label} className="contents">
                  <dt>{field.label}</dt>
                  <dd className="whitespace-pre-line text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Media */}
          <section className="rounded-lg border bg-card p-4 text-sm">
            <h2 className="mb-3 font-medium">
              Attachments{media.length ? ` (${media.length})` : ""}
            </h2>
            {media.length === 0 ? (
              <p className="text-muted-foreground">No attachments.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {media.map((item, i) =>
                  item.url ? (
                    <li key={item.path} className="flex flex-col gap-1">
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.url}
                          alt={`Attachment ${i + 1}`}
                          className="aspect-square w-full rounded-md border object-cover"
                        />
                      </a>
                      <a
                        href={item.url}
                        download
                        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                      >
                        Download
                      </a>
                    </li>
                  ) : (
                    <li key={item.path} className="text-xs text-muted-foreground">
                      Attachment unavailable
                    </li>
                  )
                )}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
