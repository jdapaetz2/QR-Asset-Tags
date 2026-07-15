import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/relative-time";
import {
  ReturnInspectionSummary,
  isReturnInspectionV2,
} from "@/components/submissions/return-inspection-summary";
import { submissionFields } from "@/lib/submissions/display";
import { submissionReference } from "@/lib/submissions/inbox";
import { isInspectionFormType, returnChecklistFlags } from "@/lib/submissions/returns";
import { normalizeOrigin } from "@/lib/submissions/origin";
import type {
  RelatedSubmissionRow,
  SubmissionDetailRow,
} from "@/lib/submissions/detail-data";

/**
 * Shared, presentational submission-detail RECORD content (Wave 3N.3): the structured report (V1/V2),
 * the submitter/performed-by block, and the related opposite-origin return checklists — in the exact
 * `isInspection` order used by the admin page. Rendered identically by the admin dashboard page and the
 * read-only staff wrapper; each surface supplies its own chrome (back link, status actions, asset context)
 * and its own `submissionHref` for the related links. Pure data-in / JSX-out (the caller signs media).
 */

export function SubmissionDetailRecord({
  submission,
  signedByPath,
  related,
  submissionHref,
}: {
  submission: SubmissionDetailRow;
  /** path → signed URL for this submission's attachments (from the caller's single signing pass). */
  signedByPath: Map<string, string | null>;
  related: RelatedSubmissionRow[];
  /** Surface-specific route to a related submission's own detail view. */
  submissionHref: (submissionId: string) => string;
}) {
  const origin = normalizeOrigin(submission.submission_origin);
  const isStaff = origin === "staff";
  const isInspection = isInspectionFormType(submission.form_type);
  const relatedHeading = isStaff
    ? "Related renter return checklists"
    : "Related staff return checklist";

  const fields = submissionFields(submission.form_type, submission.submission_data_json);
  const v2Data = isReturnInspectionV2(submission.submission_data_json)
    ? submission.submission_data_json
    : null;
  const mediaPaths = Array.isArray(submission.media_urls)
    ? (submission.media_urls as string[])
    : [];
  const media = mediaPaths.map((path) => ({ path, url: signedByPath.get(path) ?? null }));

  const submitterBlock = isStaff ? (
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
  );

  const relatedBlock =
    submission.form_type === "return_checklist" && submission.rental_session_id ? (
      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-3 font-medium">{relatedHeading}</h2>
        {related.length === 0 ? (
          <p className="text-muted-foreground">
            No {isStaff ? "renter return checklists" : "staff return checklist"} for this rental.
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
                      href={submissionHref(r.id)}
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
    ) : null;

  // The structured report (rendered ONCE). V2 → guided summary + photos by slot; V1 → flat details + media.
  const reportBlock = v2Data ? (
    <ReturnInspectionSummary data={v2Data} signedByPath={signedByPath} />
  ) : (
    <>
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
  );

  // Inspections lead with the report; damage/support keep the report last.
  return isInspection ? (
    <>
      {reportBlock}
      {submitterBlock}
      {relatedBlock}
    </>
  ) : (
    <>
      {submitterBlock}
      {relatedBlock}
      {reportBlock}
    </>
  );
}
