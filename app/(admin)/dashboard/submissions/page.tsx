import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import {
  SUBMISSION_STATUSES,
  FORM_TYPE_LABELS,
  formTypeLabel,
} from "@/lib/submissions/display";
import {
  FILTER_FORM_TYPES,
  QUICK_FILTERS,
  activeQuickFilterKey,
  firstImagePath,
  hasMedia,
  matchesSearch,
  mediaCount,
  parseSubmissionFilters,
  resolveStatusFilter,
  submissionFilterQuery,
  submissionReference,
  submissionUrgency,
  urgencyTone,
} from "@/lib/submissions/inbox";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshControls } from "@/components/refresh-controls";
import { SubmissionQuickStatus } from "@/components/submission-quick-status";
import { submissionStatusTone, type BadgeTone } from "@/lib/ui/status";
import { submissionStatusLabel } from "@/lib/ui/status-labels";

const SUBMISSIONS_BUCKET = "submissions";

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// Distinct tone per form type so damage/support/return read at a glance.
const FORM_TYPE_TONE: Record<string, BadgeTone> = {
  damage_report: "danger",
  support_request: "info",
  return_checklist: "success",
};

type SubmissionRow = {
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

type AssetOption = { id: string; asset_code: string; asset_name: string };

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toISOString().slice(0, 16).replace("T", " ");
}

/** Compact "3h ago" style relative label for the received column. */
function relativeTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

const selectClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireOrgId();
  const sp = await searchParams;
  const filters = parseSubmissionFilters(sp);

  const supabase = await createClient();

  // RLS-scoped: only this organization's assets and submissions are visible.
  const { data: assetData } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name")
    .order("asset_code", { ascending: true });
  const assets = (assetData ?? []) as AssetOption[];

  let query = supabase
    .from("form_submissions")
    .select(
      "id, created_at, form_type, status, submitted_by_name, submitted_by_email, submitted_by_phone, submission_data_json, media_urls, asset:assets(asset_code, asset_name)"
    )
    .order("created_at", { ascending: false });

  // Archived is hidden unless deliberately selected. No status → active statuses only.
  const statusFilter = resolveStatusFilter(filters.status);
  if (statusFilter.mode === "single") {
    query = query.eq("status", statusFilter.status);
  } else {
    query = query.in("status", statusFilter.statuses as readonly string[]);
  }
  if (filters.formType) query = query.eq("form_type", filters.formType);
  if (filters.assetId) query = query.eq("asset_id", filters.assetId);

  const { data } = await query;
  let rows = (data ?? []) as unknown as SubmissionRow[];

  // Text search + "has attachments" run in memory over the RLS-scoped, org-bounded
  // result. Search spans joined asset fields + the computed reference, which a single
  // SQL filter can't; jsonb-array length (media) is also awkward in PostgREST.
  if (filters.q) rows = rows.filter((r) => matchesSearch(r, filters.q));
  if (filters.hasMedia) rows = rows.filter((r) => hasMedia(r.media_urls));

  // Signed image thumbnails for the VISIBLE rows only (post-filter) — never for the
  // whole org. Private bucket; the storage SELECT policy scopes these to the caller's
  // organization and the URLs are short-lived (3600s). Admin route only.
  const thumbs = new Map<string, string>();
  await Promise.all(
    rows.map(async (r) => {
      const path = firstImagePath(r.media_urls);
      if (!path) return;
      const { data: signed } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .createSignedUrl(path, 3600);
      if (signed?.signedUrl) thumbs.set(r.id, signed.signedUrl);
    })
  );

  // Cheap RLS-scoped cue: how many submissions are still "new" (own org).
  const { count: newCount } = await supabase
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  const renderedAt = new Date().toISOString();

  // Carry the server-side filters into the CSV export. Media and submitter search
  // are view-only refinements the export route doesn't apply, so they're omitted
  // to keep the CSV consistent with the filters it actually honors.
  const exportQuery = submissionFilterQuery({
    formType: filters.formType,
    status: filters.status,
    assetId: filters.assetId,
  });
  const exportHref = `/dashboard/submissions/export${
    exportQuery ? `?${exportQuery}` : ""
  }`;

  const activeChip = activeQuickFilterKey(filters);
  // The current URL, so quick status updates return the operator to this view.
  const listQuery = submissionFilterQuery(filters);
  const listHref = `/dashboard/submissions${listQuery ? `?${listQuery}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Submissions"
        description="Damage reports, support requests, and return checklists from your QR pages."
        actions={
          <>
            <Badge tone={newCount ? "info" : "neutral"}>{newCount ?? 0} new</Badge>
            <RefreshControls renderedAt={renderedAt} pollMs={30000} />
            <a
              href={exportHref}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Export CSV
            </a>
          </>
        }
      />

      {/* Quick-filter chips */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((chip) => {
          const q = submissionFilterQuery(chip.params);
          const href = `/dashboard/submissions${q ? `?${q}` : ""}`;
          const active = activeChip === chip.key;
          return (
            <Link
              key={chip.key}
              href={href}
              aria-current={active ? "true" : undefined}
              className={
                active
                  ? "rounded-full border border-foreground/20 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                  : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }
            >
              {chip.label}
            </Link>
          );
        })}
      </div>

      {/* Simple GET-form filters */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Submitter, asset, or reference"
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Type</span>
          <select
            name="form_type"
            defaultValue={filters.formType}
            className={selectClass}
          >
            <option value="">All</option>
            {FILTER_FORM_TYPES.map((t) => (
              <option key={t} value={t}>
                {FORM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select
            name="status"
            defaultValue={filters.status}
            className={selectClass}
          >
            <option value="">All active</option>
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {submissionStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Asset</span>
          <select
            name="asset_id"
            defaultValue={filters.assetId}
            className={selectClass}
          >
            <option value="">All</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.asset_code}
              </option>
            ))}
          </select>
        </label>
        {filters.hasMedia ? (
          <input type="hidden" name="media" value="1" />
        ) : null}
        <button
          type="submit"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Filter
        </button>
        <Link
          href="/dashboard/submissions"
          className="px-1 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Media</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Asset</th>
              <th className="px-4 py-2 font-medium">Submitter</th>
              <th className="px-4 py-2 font-medium">Received</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Quick actions</th>
              <th className="px-4 py-2 font-medium sr-only">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6">
                  <EmptyState
                    title="No submissions match"
                    description="Damage reports, support requests, and return checklists that renters submit from your QR pages land here — with photos and contact details. Add assets and generate QR tags to start collecting them."
                    action={
                      <Link
                        href="/dashboard/assets"
                        className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        Go to assets
                      </Link>
                    }
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const count = mediaCount(row.media_urls);
                const thumb = thumbs.get(row.id);
                const urgency = submissionUrgency(
                  row.form_type,
                  row.submission_data_json
                );
                const submitter =
                  row.submitted_by_name ??
                  row.submitted_by_email ??
                  row.submitted_by_phone ??
                  "—";
                const reference = submissionReference(row.id, row.created_at);
                const isNew = row.status === "new";
                return (
                  <tr
                    key={row.id}
                    className={
                      isNew
                        ? "border-b last:border-0 bg-sky-500/[0.04]"
                        : "border-b last:border-0"
                    }
                  >
                    {/* Media: image thumbnail (first image) or attachment count */}
                    <td className="px-3 py-2">
                      {thumb ? (
                        <div className="relative size-12">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumb}
                            alt={`Attachment for ${reference}`}
                            className="size-12 rounded-md border object-cover"
                          />
                          {count > 1 ? (
                            <span className="absolute -right-1 -top-1 rounded-full border bg-background px-1 text-[10px] font-medium text-muted-foreground">
                              +{count - 1}
                            </span>
                          ) : null}
                        </div>
                      ) : count > 0 ? (
                        <span
                          className="inline-flex size-12 items-center justify-center gap-1 rounded-md border text-xs text-muted-foreground"
                          title={`${count} attachment${count === 1 ? "" : "s"}`}
                        >
                          <span aria-hidden>📎</span>
                          {count}
                        </span>
                      ) : (
                        <span className="inline-flex size-12 items-center justify-center rounded-md border border-dashed text-muted-foreground/50">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={FORM_TYPE_TONE[row.form_type] ?? "neutral"}>
                          {formTypeLabel(row.form_type)}
                        </Badge>
                        {urgency ? (
                          <Badge tone={urgencyTone(urgency)}>
                            {titleCase(urgency)}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {row.asset ? (
                        <div className="leading-tight">
                          <div className="font-medium">{row.asset.asset_code}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.asset.asset_name}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{submitter}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      <div className="leading-tight">
                        <div>{formatDateTime(row.created_at)}</div>
                        <div className="text-xs">{relativeTime(row.created_at)}</div>
                        <div className="font-mono text-[11px] text-muted-foreground/70">
                          {reference}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={submissionStatusTone(row.status)}>
                        {submissionStatusLabel(row.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <SubmissionQuickStatus
                        submissionId={row.id}
                        current={row.status}
                        redirectTo={listHref}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/dashboard/submissions/${row.id}`}
                        className="text-sm underline-offset-4 hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
