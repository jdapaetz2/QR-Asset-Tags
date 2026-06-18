import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { submissionFields, formTypeLabel } from "@/lib/submissions/display";
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
  asset: { asset_code: string; asset_name: string } | null;
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 16).replace("T", " ");
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
      "id, created_at, form_type, status, submitted_by_name, submitted_by_email, submitted_by_phone, submission_data_json, media_urls, asset:assets(asset_code, asset_name)"
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (!data) notFound();

  const submission = data as unknown as SubmissionDetail;
  const fields = submissionFields(
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

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard/submissions"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Submissions
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {formTypeLabel(submission.form_type)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {submission.asset
            ? `${submission.asset.asset_name} (${submission.asset.asset_code}) · `
            : ""}
          {formatDateTime(submission.created_at)}
        </p>
      </section>

      {/* Status */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="text-sm">
          <h2 className="font-medium">Status</h2>
          <p className="text-muted-foreground">{submission.status}</p>
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
