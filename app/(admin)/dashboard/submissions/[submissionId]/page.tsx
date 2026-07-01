import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { submissionFields, formTypeLabel } from "@/lib/submissions/display";
import {
  mediaCount,
  submissionReference,
  submissionUrgency,
  urgencyTone,
} from "@/lib/submissions/inbox";
import { Badge } from "@/components/ui/badge";
import { submissionStatusTone } from "@/lib/ui/status";
import { SubmissionStatusForm } from "@/components/submission-status-form";

const SUBMISSIONS_BUCKET = "submissions";

type SubmissionDetail = {
  id: string;
  created_at: string;
  form_type: string;
  status: string;
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

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  await requireOrgId();
  const { submissionId } = await params;

  const supabase = await createClient();

  // RLS-scoped: a submission from another organization isn't returned → 404.
  const { data } = await supabase
    .from("form_submissions")
    .select(
      "id, created_at, form_type, status, submitted_by_name, submitted_by_email, submitted_by_phone, submission_data_json, media_urls, asset_id, asset:assets(asset_code, asset_name)"
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

  return (
    <div className="flex flex-col gap-6">
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
            {formTypeLabel(submission.form_type)}
          </h1>
          <Badge tone={submissionStatusTone(submission.status)}>
            {titleCase(submission.status)}
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
          {formatDateTime(submission.created_at)}
        </p>
      </section>

      {/* Asset */}
      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-3 font-medium">Asset</h2>
        {submission.asset ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="leading-tight">
              <div className="font-medium">{submission.asset.asset_name}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {submission.asset.asset_code}
              </div>
            </div>
            {submission.asset_id ? (
              <div className="flex flex-wrap gap-2">
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
        <SubmissionStatusForm
          submissionId={submission.id}
          current={submission.status}
        />
      </section>

      {/* Submitter */}
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

      {/* Form-specific fields */}
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
    </div>
  );
}
