import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/auth/session";
import { canCustomerUseExport } from "@/lib/export/access";
import { isExportTypeEnabled, toExportFlags } from "@/lib/export/types";
import { countNewSubmissions } from "@/lib/submissions/counts";
import { currentListHref, withReturnTo } from "@/lib/nav/return-to";
import { RelativeTime } from "@/components/relative-time";
import {
  SUBMISSION_STATUSES,
  FORM_TYPE_LABELS,
} from "@/lib/submissions/display";
import { SubmissionBadges } from "@/components/submissions/submission-badges";
import { secondaryActionClass } from "@/components/ui/secondary-action-link";
import {
  BulkSelectionProvider,
  SelectAllCheckbox,
  SelectCheckbox,
} from "@/components/submissions/bulk-selection";
import { isOpenDamageRow } from "@/lib/submissions/damage";
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
import { AssetCodeChip } from "@/components/ui/asset-code-chip";
import { ListCard, ListCardGroup, ListCardMeta } from "@/components/ui/list-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshControls } from "@/components/refresh-controls";
import { MarkReturnedResolveButton } from "@/components/mark-returned-resolve-button";
import { ReturnDoneNotice } from "@/components/return-done-notice";
import {
  canQuickResolveReturn,
  returnChecklistFlags,
} from "@/lib/submissions/returns";
import { submissionStatusTone } from "@/lib/ui/status";
import { submissionStatusLabel } from "@/lib/ui/status-labels";

const SUBMISSIONS_BUCKET = "submissions";

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type SubmissionRow = {
  id: string;
  created_at: string;
  form_type: string;
  status: string;
  submission_origin: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_by_phone: string | null;
  submission_data_json: unknown;
  media_urls: unknown;
  asset_id: string | null;
  asset: { asset_code: string; asset_name: string } | null;
};

type AssetOption = { id: string; asset_code: string; asset_name: string };

const selectClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { orgId, profile } = await requireOrgContext();
  const sp = await searchParams;
  const filters = parseSubmissionFilters(sp);
  // The current filtered inbox URL, carried into each detail link + resolve action so Back and post-action
  // redirects land on this exact filtered list (Wave 3N.2).
  const listHref = currentListHref("/dashboard/submissions", sp);

  const supabase = await createClient();

  // The inbox CSV is a customer data export: owner-enabled, customer-admin-only, and requires the
  // `submissions` type (Phase A3.1). Mirrors the route guard exactly so the button and the route
  // can never disagree.
  const { data: exportOrg } = await supabase
    .from("organizations")
    .select(
      "customer_exports_enabled, export_assets_enabled, export_qr_mapping_enabled, export_documents_enabled, export_submissions_enabled"
    )
    .eq("id", orgId)
    .maybeSingle();
  const exportFlags = toExportFlags(exportOrg);
  const canExportSubmissions =
    canCustomerUseExport({ role: profile.role, flags: exportFlags }) &&
    isExportTypeEnabled(exportFlags, "submissions");

  // RLS-scoped: only this organization's assets and submissions are visible.
  const { data: assetData } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name")
    .order("asset_code", { ascending: true });
  const assets = (assetData ?? []) as AssetOption[];

  let query = supabase
    .from("form_submissions")
    .select(
      "id, created_at, form_type, status, submission_origin, submitted_by_name, submitted_by_email, submitted_by_phone, submission_data_json, media_urls, asset_id, asset:assets(asset_code, asset_name)"
    )
    .order("created_at", { ascending: false });

  // No status → the Unresolved default (new + reviewed). "all_active" adds resolved;
  // archived shows only when deliberately selected. resolveStatusFilter is the source of truth.
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
  // attention=damage narrows to OPEN damage rows only (damage reports + damaged returns), never
  // broadened to undamaged returns. Applied in memory over the already-RLS-scoped rows.
  if (filters.attention === "damage") rows = rows.filter((r) => isOpenDamageRow(r));

  // Assets that still have an ACTIVE rental session (Phase 3C.2) — one batched RLS-scoped query, no N+1.
  // Drives authoritative "Mark returned & resolve" eligibility (renter return + still Rented only).
  const { data: activeSessions } = await supabase
    .from("asset_rental_sessions")
    .select("asset_id")
    .eq("status", "active");
  const rentedAssetIds = new Set(
    ((activeSessions ?? []) as { asset_id: string | null }[])
      .map((s) => s.asset_id)
      .filter((id): id is string => Boolean(id))
  );

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

  // Same shared helper as the nav badge, so the "X new" pill and the badge can never disagree (Phase 3C.4).
  const newCount = await countNewSubmissions(supabase);

  // Total submissions for the org (any status) → distinguishes "nothing yet" from
  // "nothing matches the current filters" for the empty state.
  const { count: totalCount } = await supabase
    .from("form_submissions")
    .select("id", { count: "exact", head: true });
  const hasAnySubmissions = (totalCount ?? 0) > 0;

  /**
   * Per-row view data, derived ONCE (Phase B2). The desktop table and the mobile card list are two
   * presentations of this same array — so there is no second query and no duplicated derivation.
   */
  const viewRows = rows.map((row) => {
    const flags =
      row.form_type === "return_checklist"
        ? returnChecklistFlags(row.submission_data_json)
        : { damage: false, missing: false };
    return {
      row,
      count: mediaCount(row.media_urls),
      thumb: thumbs.get(row.id),
      urgency: submissionUrgency(row.form_type, row.submission_data_json),
      flags,
      rowDamage: row.form_type === "damage_report" ? true : flags.damage,
      submitter:
        row.submitted_by_name ??
        row.submitted_by_email ??
        row.submitted_by_phone ??
        "—",
      reference: submissionReference(row.id, row.created_at),
      isNew: row.status === "new",
      quickResolve: canQuickResolveReturn({
        formType: row.form_type,
        status: row.status,
        origin: row.submission_origin,
        assetRented: row.asset_id ? rentedAssetIds.has(row.asset_id) : false,
      }),
    };
  });

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

  // Multi-select (Phase 3C.4): "select all" spans only the currently-rendered rows. The filter signature keys
  // the provider so any filter change remounts it and clears selection. Archived view swaps in Restore.
  const visibleIds = rows.map((r) => r.id);
  const viewingArchived = filters.status === "archived";
  const filterSignature = JSON.stringify([
    filters.q,
    filters.formType,
    filters.status,
    filters.assetId,
    filters.hasMedia,
    filters.attention,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ReturnDoneNotice done={typeof sp.done === "string" ? sp.done : null} />
      <PageHeader
        title="Submissions"
        description="Damage reports, support requests, and return checklists from your QR pages."
        actions={
          <>
            <Badge tone={newCount ? "info" : "neutral"}>{newCount ?? 0} new</Badge>
            <RefreshControls renderedAt={renderedAt} pollMs={30000} />
            {canExportSubmissions ? (
              <a href={exportHref} className={secondaryActionClass}>
                Export CSV
              </a>
            ) : null}
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
            // "" is the default view (Unresolved). An explicit ?status=unresolved
            // deep-link resolves to the same set, so show it on the "" option.
            defaultValue={filters.status === "unresolved" ? "" : filters.status}
            className={selectClass}
          >
            <option value="">Unresolved (new + reviewed)</option>
            <option value="all_active">All active</option>
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

      <BulkSelectionProvider
        key={filterSignature}
        visibleIds={visibleIds}
        viewingArchived={viewingArchived}
      >
      {/* Desktop/tablet: the compact inbox table, unchanged. Gated to `md`+ because a wide table
          forces its min-content width into the document intrinsic width even inside this scroller,
          which makes mobile Chromium shrink-to-fit the whole page (Phase B2 / D-1). */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">
                <SelectAllCheckbox />
                <span className="sr-only">Select</span>
              </th>
              <th className="px-3 py-2 font-medium">Media</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Asset</th>
              <th className="px-4 py-2 font-medium">Submitter</th>
              <th className="px-4 py-2 font-medium">Received</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium sr-only">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6">
                  {hasAnySubmissions ? (
                    <EmptyState
                      title="No submissions match"
                      description="No submissions match the current filters. Adjust or clear the filters to see more."
                      action={
                        <Link
                          href="/dashboard/submissions"
                          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          Clear filters
                        </Link>
                      }
                    />
                  ) : (
                    <EmptyState
                      title="No submissions yet"
                      description="No submissions yet. Open a scan page and send a test report — damage, support, and return checklists land here with photos and contact details."
                      action={
                        <Link
                          href="/dashboard/assets"
                          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          Go to assets
                        </Link>
                      }
                    />
                  )}
                </td>
              </tr>
            ) : (
              viewRows.map(({ row, count, thumb, urgency, flags, rowDamage, submitter, reference, isNew, quickResolve }) => {
                return (
                  <tr
                    key={row.id}
                    className={
                      isNew
                        ? "border-b border-l-2 border-l-info bg-info/[0.05] last:border-b-0"
                        : "border-b last:border-0"
                    }
                  >
                    <td className="px-3 py-2 align-top">
                      <SelectCheckbox id={row.id} />
                    </td>
                    {/* Media: image thumbnail (first image) or attachment count */}
                    <td className="px-3 py-2">
                      {thumb ? (
                        <div className="relative size-10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumb}
                            alt={`Attachment for ${reference}`}
                            className="size-10 rounded-md border object-cover"
                          />
                          {count > 1 ? (
                            <span className="absolute -right-1 -top-1 rounded-full border bg-background px-1 text-[10px] font-medium text-muted-foreground">
                              +{count - 1}
                            </span>
                          ) : null}
                        </div>
                      ) : count > 0 ? (
                        <span
                          className="inline-flex size-10 items-center justify-center gap-1 rounded-md border text-xs text-muted-foreground"
                          title={`${count} attachment${count === 1 ? "" : "s"}`}
                        >
                          <span aria-hidden>📎</span>
                          {count}
                        </span>
                      ) : (
                        <span className="inline-flex size-10 items-center justify-center rounded-md border border-dashed text-muted-foreground/50">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SubmissionBadges
                          formType={row.form_type}
                          origin={row.submission_origin}
                          status={row.status}
                          damage={rowDamage}
                          missing={flags.missing}
                          showStatus={false}
                        />
                        {urgency ? (
                          <Badge tone={urgencyTone(urgency)}>
                            {titleCase(urgency)}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {row.asset ? (
                        <div className="flex flex-col items-start gap-1 leading-tight">
                          <AssetCodeChip code={row.asset.asset_code} />
                          <span className="text-xs text-muted-foreground">
                            {row.asset.asset_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-2 ${isNew ? "font-medium text-foreground" : ""}`}>
                      {submitter}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      <div className="leading-tight">
                        <div><RelativeTime value={row.created_at} /></div>
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
                    <td className="whitespace-nowrap px-4 py-2">
                      <div className="flex flex-col items-end gap-1.5">
                        <Link
                          href={withReturnTo(`/dashboard/submissions/${row.id}`, listHref)}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                        >
                          Open
                        </Link>
                        {quickResolve ? (
                          <MarkReturnedResolveButton
                            submissionId={row.id}
                            redirectTo={listHref}
                            dense
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: same `viewRows`, same BulkSelectionProvider — so SelectCheckbox shares selection
          state with the desktop table and bulk actions keep working. Identity + status first, both
          Open and Mark returned & resolve reachable without any horizontal dragging. */}
      {viewRows.length === 0 ? (
        <div className="md:hidden">
          {hasAnySubmissions ? (
            <EmptyState
              title="No submissions match"
              description="No submissions match the current filters. Adjust or clear the filters to see more."
              action={
                <Link
                  href="/dashboard/submissions"
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No submissions yet"
              description="No submissions yet. Open a scan page and send a test report — damage, support, and return checklists land here with photos and contact details."
              action={
                <Link
                  href="/dashboard/assets"
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  Go to assets
                </Link>
              }
            />
          )}
        </div>
      ) : (
        <>
        {/* Select-all on mobile. The table's copy lives in a `<thead>`, which does not render below
            `md`; without this, phone users could select rows one at a time but never all of them. */}
        <label className="flex min-h-11 items-center gap-2.5 px-1 text-sm text-muted-foreground md:hidden">
          <SelectAllCheckbox />
          Select all visible
        </label>
        <ListCardGroup>
          {viewRows.map(({ row, count, urgency, flags, rowDamage, submitter, reference, isNew, quickResolve }) => (
            <ListCard
              key={row.id}
              title={
                <span className="flex items-start gap-2.5">
                  <SelectCheckbox id={row.id} />
                  <span className="flex min-w-0 flex-col gap-1">
                    {row.asset ? (
                      <>
                        <AssetCodeChip code={row.asset.asset_code} />
                        <span className="text-xs font-normal text-muted-foreground">
                          {row.asset.asset_name}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </span>
              }
              status={
                <>
                  <Badge tone={submissionStatusTone(row.status)}>
                    {submissionStatusLabel(row.status)}
                  </Badge>
                  {count > 0 ? (
                    <span className="text-xs text-muted-foreground" title={`${count} attachment${count === 1 ? "" : "s"}`}>
                      <span aria-hidden>📎</span> {count}
                    </span>
                  ) : null}
                </>
              }
              actions={
                <>
                  <Link
                    href={withReturnTo(`/dashboard/submissions/${row.id}`, listHref)}
                    className={`text-sm underline-offset-4 hover:underline ${isNew ? "font-semibold" : "font-medium"}`}
                  >
                    Open
                  </Link>
                  {quickResolve ? (
                    <MarkReturnedResolveButton submissionId={row.id} redirectTo={listHref} dense />
                  ) : null}
                </>
              }
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <SubmissionBadges
                  formType={row.form_type}
                  origin={row.submission_origin}
                  status={row.status}
                  damage={rowDamage}
                  missing={flags.missing}
                  showStatus={false}
                />
                {urgency ? <Badge tone={urgencyTone(urgency)}>{titleCase(urgency)}</Badge> : null}
              </div>
              <ListCardMeta label="Submitter" value={submitter} />
              <ListCardMeta label="Received" value={<RelativeTime value={row.created_at} />} />
              <ListCardMeta
                label="Reference"
                value={<span className="font-mono text-[11px] break-all">{reference}</span>}
              />
            </ListCard>
          ))}
        </ListCardGroup>
        </>
      )}
      </BulkSelectionProvider>
    </div>
  );
}
