import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { PrimaryButton } from "@/components/ui/primary-button";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AssetThumb } from "@/components/asset-thumb";
import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { AssetStatusCell } from "@/components/ui/asset-status-cell";
import { deriveAssetStatus } from "@/lib/ui/status-view";
import { PlanUsage } from "@/components/plan-usage";
import { getCoveredCount } from "@/lib/plans/coverage-query";
import { getOrgCategories } from "@/lib/assets/categories";
import { closeRentalSession } from "@/lib/rentals/actions";
import { MarkRentedButton } from "@/components/mark-rented-button";
import {
  UNRESOLVED_STATUSES,
  countUnresolvedByAsset,
} from "@/lib/submissions/inbox";
import {
  OPEN_DAMAGE_COLUMNS,
  openDamageSummaryByAsset,
  type OpenDamageRow,
} from "@/lib/submissions/damage";
import { OpenDamageBadge } from "@/components/assets/open-damage-badge";
import {
  parseAssetListParams,
  sanitizeSearch,
  assetPageStatus,
  matchesQrFilter,
  matchesPageFilter,
  matchesRentalFilter,
  PUBLIC_STATUS_FILTERS,
  QR_FILTERS,
  PAGE_FILTERS,
  LIFECYCLE_FILTERS,
  RENTAL_FILTERS,
  VISIBLE_ASSET_SORTS,
} from "@/lib/assets/list";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type AssetRow = {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string | null;
  make: string | null;
  model: string | null;
  public_status: string;
  created_at: string;
  archived_at: string | null;
  cover_image_url: string | null;
};

const selectClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

const labelClass =
  "text-[11px] font-medium uppercase tracking-[0.06em] text-iron-600";

const SORT_LABELS: Record<string, string> = {
  asset_code: "Code",
  asset_name: "Name",
  created_at: "Newest",
  category: "Category",
};

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireOrgId();
  const sp = await searchParams;
  const params = parseAssetListParams(sp);

  const supabase = await createClient();

  // Base query — RLS scopes to the caller's organization.
  let query = supabase
    .from("assets")
    .select(
      "id, asset_code, asset_name, category, make, model, public_status, created_at, archived_at, cover_image_url"
    );

  const search = sanitizeSearch(params.q);
  if (search) {
    query = query.or(
      [
        "asset_code",
        "asset_name",
        "category",
        "make",
        "model",
        "serial_number",
      ]
        .map((col) => `${col}.ilike.*${search}*`)
        .join(",")
    );
  }
  if (params.publicStatus !== "all") {
    query = query.eq("public_status", params.publicStatus);
  }
  if (params.category) query = query.eq("category", params.category);
  if (params.lifecycle === "active") query = query.is("archived_at", null);
  if (params.lifecycle === "archived") {
    query = query.not("archived_at", "is", null);
  }
  query = query.order(params.sort, { ascending: params.sort !== "created_at" });

  const { data } = await query;
  const allRows = (data ?? []) as AssetRow[];

  // QR + page status come from per-org lookups (joins are filtered in JS).
  const { data: qrData } = await supabase
    .from("qr_links")
    .select("asset_id, status");
  const qrByAsset = new Map<string, { hasActive: boolean }>();
  for (const q of (qrData ?? []) as { asset_id: string; status: string }[]) {
    const prev = qrByAsset.get(q.asset_id);
    qrByAsset.set(q.asset_id, {
      hasActive: (prev?.hasActive ?? false) || q.status === "active",
    });
  }

  const { data: pageData } = await supabase
    .from("equipment_pages")
    .select("asset_id, is_published");
  const pageByAsset = new Map<string, boolean>();
  for (const p of (pageData ?? []) as {
    asset_id: string;
    is_published: boolean;
  }[]) {
    pageByAsset.set(p.asset_id, p.is_published);
  }

  // Active rental session per asset (one query, mapped by asset_id — no N+1). RLS
  // scopes to the caller's organization.
  const { data: rentalData } = await supabase
    .from("asset_rental_sessions")
    .select("asset_id, id")
    .eq("status", "active");
  const activeSessionByAsset = new Map<string, string>();
  for (const r of (rentalData ?? []) as { asset_id: string; id: string }[]) {
    activeSessionByAsset.set(r.asset_id, r.id);
  }

  // Unresolved (new/reviewed) submissions per asset — one RLS-scoped query, grouped in memory (NO N+1).
  // The same rows drive BOTH the pre-rent warning count and the open-damage indicator.
  const { data: openSubs } = await supabase
    .from("form_submissions")
    .select(OPEN_DAMAGE_COLUMNS)
    .in("status", UNRESOLVED_STATUSES as readonly string[]);
  const openRows = (openSubs ?? []) as OpenDamageRow[];
  const unresolvedByAsset = countUnresolvedByAsset(openRows);
  const openDamageByAsset = openDamageSummaryByAsset(openRows);

  // Distinct, normalized categories for the filter dropdown (own org only).
  const categories = await getOrgCategories(supabase);

  // Compact covered-asset usage indicator (RLS-scoped, display only — enforcement
  // stays server-side in createQrLink / createTagRequest + DB trigger).
  const coveredCount = await getCoveredCount(supabase);
  const { data: planOrg } = await supabase
    .from("organizations")
    .select("plan_name, asset_limit")
    .maybeSingle();

  const rows = allRows
    .map((asset) => {
      const hasQr = qrByAsset.has(asset.id);
      const hasActiveQr = qrByAsset.get(asset.id)?.hasActive ?? false;
      const pageStatus = assetPageStatus(
        pageByAsset.has(asset.id),
        pageByAsset.get(asset.id) ?? false
      );
      const activeSessionId = activeSessionByAsset.get(asset.id) ?? null;
      return { asset, hasQr, hasActiveQr, pageStatus, activeSessionId };
    })
    .filter(
      (r) =>
        matchesQrFilter(params.qr, r.hasQr) &&
        matchesPageFilter(params.page, r.pageStatus) &&
        matchesRentalFilter(params.rental, r.activeSessionId !== null)
    );

  // Preserve the current filters/sort when a quick toggle redirects back here.
  const listHref = `/dashboard/assets${
    typeof sp === "object"
      ? (() => {
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries(sp)) {
            const val = Array.isArray(v) ? v[0] : v;
            if (typeof val === "string" && val) qs.set(k, val);
          }
          const s = qs.toString();
          return s ? `?${s}` : "";
        })()
      : ""
  }`;

  const filtersActive =
    Boolean(params.q) ||
    params.publicStatus !== "all" ||
    Boolean(params.category) ||
    params.qr !== "all" ||
    params.page !== "all" ||
    params.lifecycle !== "active" ||
    params.rental !== "all";

  // Advanced (non-search) filters live behind a native <details> disclosure. Count the
  // non-default ones for the summary chip, and open the disclosure when any is active or
  // the sort is non-default (defaults come from parseAssetListParams in lib/assets/list).
  const activeFilterCount = [
    params.publicStatus !== "all",
    Boolean(params.category),
    params.qr !== "all",
    params.page !== "all",
    params.lifecycle !== "active",
    params.rental !== "all",
  ].filter(Boolean).length;
  const filtersOpen = activeFilterCount > 0 || params.sort !== "asset_code";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assets"
        description={`${rows.length} asset${rows.length === 1 ? "" : "s"}${
          filtersActive ? " (filtered)" : ""
        }`}
        actions={
          <>
            <PlanUsage
              mode="compact"
              data={{
                planName: planOrg?.plan_name ?? "Custom plan",
                covered: coveredCount,
                limit: (planOrg?.asset_limit as number | null) ?? null,
              }}
            />
            <Button asChild variant="outline">
              <Link href="/dashboard/assets/import">Import CSV</Link>
            </Button>
            <PrimaryButton href="/dashboard/assets/new">New asset</PrimaryButton>
          </>
        }
      />

      {/* Compact toolbar: search + Apply/Clear always visible; advanced filters collapse
          into a native <details> (no client JS, no dependency). Collapsed selects still
          submit — hidden, non-disabled form controls are included in GET submission. */}
      <form method="get" className="rounded-lg border bg-card p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Search code, name, category, make, model, serial…"
            aria-label="Search assets"
            className={`${selectClass} w-full sm:flex-1`}
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/assets">Clear</Link>
            </Button>
          </div>
        </div>

        <details className="group mt-2" open={filtersOpen}>
          <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-iron-600 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="size-3 transition-transform group-open:rotate-180"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Visibility</span>
              <select name="status" defaultValue={params.publicStatus} className={`${selectClass} w-full`}>
                {PUBLIC_STATUS_FILTERS.map((v) => (
                  <option key={v} value={v}>
                    {v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Category</span>
              <select name="category" defaultValue={params.category} className={`${selectClass} w-full`}>
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>QR</span>
              <select name="qr" defaultValue={params.qr} className={`${selectClass} w-full`}>
                {QR_FILTERS.map((v) => (
                  <option key={v} value={v}>
                    {v === "all" ? "All" : v === "has" ? "Has QR" : "Missing QR"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Page</span>
              <select name="page" defaultValue={params.page} className={`${selectClass} w-full`}>
                {PAGE_FILTERS.map((v) => (
                  <option key={v} value={v}>
                    {v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Lifecycle</span>
              <select name="lifecycle" defaultValue={params.lifecycle} className={`${selectClass} w-full`}>
                {LIFECYCLE_FILTERS.map((v) => (
                  <option key={v} value={v}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Rental</span>
              <select name="rental" defaultValue={params.rental} className={`${selectClass} w-full`}>
                {RENTAL_FILTERS.map((v) => (
                  <option key={v} value={v}>
                    {v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Sort</span>
              <select name="sort" defaultValue={params.sort} className={`${selectClass} w-full`}>
                {VISIBLE_ASSET_SORTS.map((v) => (
                  <option key={v} value={v}>
                    {SORT_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </form>

      {rows.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title="No assets match these filters"
            description="Try clearing the search or filters to see all of your equipment."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/assets">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No assets yet"
            description="Assets are your rental equipment records — each one gets a permanent QR page renters can scan for instructions and support. Add your first asset or import a CSV to get started."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button asChild variant="outline">
                  <Link href="/dashboard/assets/import">Import CSV</Link>
                </Button>
                <PrimaryButton href="/dashboard/assets/new">New asset</PrimaryButton>
              </div>
            }
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-[0.06em] text-iron-600">
              <tr>
                <th className="px-3 py-2.5 font-medium">Code</th>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ asset, hasQr, hasActiveQr, pageStatus, activeSessionId }) => (
                <tr
                  key={asset.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                    <span className="flex items-center gap-3">
                      <AssetThumb
                        src={asset.cover_image_url}
                        alt={`Photo of ${asset.asset_name}`}
                      />
                      <AssetTagChip code={asset.asset_code} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{asset.asset_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {asset.category ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col items-start gap-1.5">
                      <AssetStatusCell
                        status={deriveAssetStatus({
                          rented: Boolean(activeSessionId),
                          publicStatus: asset.public_status,
                          qrStatus: hasActiveQr ? "active" : hasQr ? "disabled" : null,
                          pageStatus,
                          archivedAt: asset.archived_at,
                        })}
                      />
                      {openDamageByAsset.has(asset.id) ? (
                        <OpenDamageBadge
                          assetId={asset.id}
                          count={openDamageByAsset.get(asset.id)!.count}
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {asset.archived_at ? null : activeSessionId ? (
                        <ActionButton
                          action={closeRentalSession.bind(
                            null,
                            asset.id,
                            activeSessionId,
                            "returned",
                            listHref
                          )}
                          variant="outline"
                          confirm="Mark this asset returned?"
                        >
                          Mark returned
                        </ActionButton>
                      ) : (
                        <MarkRentedButton
                          assetId={asset.id}
                          unresolvedCount={unresolvedByAsset.get(asset.id) ?? 0}
                          redirectTo={listHref}
                        />
                      )}
                      <Link
                        href={`/dashboard/assets/${asset.id}`}
                        className="whitespace-nowrap text-sm underline-offset-4 hover:underline"
                      >
                        View / edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
