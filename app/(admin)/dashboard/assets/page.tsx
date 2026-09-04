import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { withReturnTo } from "@/lib/nav/return-to";
import { SecondaryActionLink } from "@/components/ui/secondary-action-link";
import { Button } from "@/components/ui/button";
import { PrimaryButton } from "@/components/ui/primary-button";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AssetThumb } from "@/components/asset-thumb";
import { AssetCodeChip } from "@/components/ui/asset-code-chip";
import { ListCard, ListCardGroup, ListCardMeta } from "@/components/ui/list-card";
import { AssetStatusCell } from "@/components/ui/asset-status-cell";
import { deriveAssetStatus } from "@/lib/ui/status-view";
import { PlanUsage } from "@/components/plan-usage";
import { getCoveredCount } from "@/lib/plans/coverage-query";
import { getOrgCategories } from "@/lib/assets/categories";
import { time } from "@/lib/diagnostics/server-timing";
import { logQueryFailure, throwOnEssentialFailure } from "@/lib/diagnostics/query-failure";
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
  const { profile } = await requireOrgContext();
  // Admin-only Assets-area secondary destinations (Import, template catalogs, Tag requests) are shown only to
  // customer_admin — the routes themselves enforce the same guard (Wave 3N.1), so staff never sees a bounce link.
  const isAdmin = profile.role === ROLES.CUSTOMER_ADMIN;
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

  // Phase C2 Deploy A — the group wrapper goes in BEFORE parallelizing, so the serial duration is
  // measured by the same instrument that will measure the parallel one. C1's wall-clock comparison was
  // inconclusive because ambient latency drifted between runs; a server-side group duration is immune
  // to that. Inert unless MULEMARK_DIAGNOSTIC_TIMING=1.
  const ROUTE = "/dashboard/assets";

  /**
   * Phase C2. Every read below is independent: none filters by the ids returned from the base `assets`
   * query — the joins are built in memory afterwards — so there is no waterfall to preserve. They ran
   * one after another purely by construction, which C0 measured at 274 ms of the route's server time.
   *
   * BOUNDED: a fixed batch of eight. Never per-asset concurrency; the maps below are still built from
   * whole-organization reads in memory, so no N+1 is introduced.
   *
   * RLS is unchanged — each read uses the same caller-scoped client and the same filters as before.
   */
  const assetsGroup = await time("assets", "page.primary_queries", async () => {
    const [
      assetsRes,
      qrRes,
      pageRes,
      rentalRes,
      openSubsRes,
      categoriesRes,
      coveredRes,
      planRes,
    ] = await Promise.all([
      query,
      supabase.from("qr_links").select("asset_id, status"),
      supabase.from("equipment_pages").select("asset_id, is_published"),
      supabase.from("asset_rental_sessions").select("asset_id, id").eq("status", "active"),
      supabase
        .from("form_submissions")
        .select(OPEN_DAMAGE_COLUMNS)
        .in("status", UNRESOLVED_STATUSES as readonly string[]),
      getOrgCategories(supabase),
      getCoveredCount(supabase),
      supabase.from("organizations").select("plan_name, asset_limit").maybeSingle(),
    ]);

    // ESSENTIAL. A failed list must never render as "no assets" — that is a page confidently stating
    // something false, and it is what this route did before C2. Throwing surfaces ./error.tsx instead.
    throwOnEssentialFailure(ROUTE, "assets", assetsRes.error);
    const allRows = (assetsRes.data ?? []) as AssetRow[];

    // SECONDARY. These may degrade: a missing QR badge is a worse-but-honest page. Each failure is
    // logged with the route, the read and the Postgres code — never the message or any row data.
    logQueryFailure(ROUTE, "qr_links", qrRes.error);
    const qrByAsset = new Map<string, { hasActive: boolean }>();
    for (const q of (qrRes.data ?? []) as { asset_id: string; status: string }[]) {
      const prev = qrByAsset.get(q.asset_id);
      qrByAsset.set(q.asset_id, {
        hasActive: (prev?.hasActive ?? false) || q.status === "active",
      });
    }

    logQueryFailure(ROUTE, "equipment_pages", pageRes.error);
    const pageByAsset = new Map<string, boolean>();
    for (const p of (pageRes.data ?? []) as { asset_id: string; is_published: boolean }[]) {
      pageByAsset.set(p.asset_id, p.is_published);
    }

    logQueryFailure(ROUTE, "rental_sessions", rentalRes.error);
    const activeSessionByAsset = new Map<string, string>();
    for (const r of (rentalRes.data ?? []) as { asset_id: string; id: string }[]) {
      activeSessionByAsset.set(r.asset_id, r.id);
    }

    // The same rows drive BOTH the pre-rent warning count and the open-damage indicator.
    logQueryFailure(ROUTE, "open_submissions", openSubsRes.error);
    const openRows = (openSubsRes.data ?? []) as OpenDamageRow[];
    const unresolvedByAsset = countUnresolvedByAsset(openRows);
    const openDamageByAsset = openDamageSummaryByAsset(openRows);

    logQueryFailure(ROUTE, "organization_plan", planRes.error);

    return {
      allRows,
      qrByAsset,
      pageByAsset,
      activeSessionByAsset,
      unresolvedByAsset,
      openDamageByAsset,
      // Distinct, normalized categories for the filter dropdown (own org only).
      categories: categoriesRes,
      // Display-only usage indicator — enforcement stays in createQrLink / createTagRequest + the DB
      // trigger. `getCoveredCount` re-reads qr_links, which the batch already fetched; once the group
      // is parallel that redundancy costs no wall clock, and rewiring a commercial number for no
      // measurable gain is not a trade worth making. Recorded in PHASE_C_BASELINE, not hidden.
      coveredCount: coveredRes,
      planOrg: planRes.data,
    };
  });

  const {
    allRows,
    qrByAsset,
    pageByAsset,
    activeSessionByAsset,
    unresolvedByAsset,
    openDamageByAsset,
    categories,
    coveredCount,
    planOrg,
  } = assetsGroup;

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
            <PrimaryButton href="/dashboard/assets/new">New asset</PrimaryButton>
          </>
        }
      />

      {/* Assets-area secondary actions (Wave 3N.2/3N.4.1) — one predictable click to the admin-only setup surfaces
          (import + template catalogs + tag procurement), rendered as clear outlined secondary buttons. Shown to
          customer_admin only; the routes enforce the same. */}
      {isAdmin ? (
        <nav aria-label="Assets tools" className="flex flex-wrap gap-2">
          <SecondaryActionLink href="/dashboard/assets/import">
            Import CSV
          </SecondaryActionLink>
          <SecondaryActionLink href="/dashboard/templates">
            Equipment-page templates
          </SecondaryActionLink>
          <SecondaryActionLink href="/dashboard/templates/return-inspections">
            Return-checklist templates
          </SecondaryActionLink>
          <SecondaryActionLink href="/dashboard/tag-requests">
            Tag requests
          </SecondaryActionLink>
        </nav>
      ) : null}

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
                {isAdmin ? (
                  <Button asChild variant="outline">
                    <Link href="/dashboard/assets/import">Import CSV</Link>
                  </Button>
                ) : null}
                <PrimaryButton href="/dashboard/assets/new">New asset</PrimaryButton>
              </div>
            }
          />
        )
      ) : (
        <>
        {/* Desktop/tablet: the compact operational table, unchanged. Gated to `md`+ because a wide
            table forces its min-content width into the document's intrinsic width even inside this
            scroller, which makes mobile Chromium shrink-to-fit the whole page (Phase B2 / D-1). */}
        <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
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
                      <AssetCodeChip code={asset.asset_code} />
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
                          assetName={asset.asset_name}
                          assetCode={asset.asset_code}
                          unresolvedCount={unresolvedByAsset.get(asset.id) ?? 0}
                          redirectTo={listHref}
                        />
                      )}
                      <Link
                        href={withReturnTo(`/dashboard/assets/${asset.id}`, listHref)}
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

        {/* Mobile: same `rows`, no second query. Identity + status first, both actions in the card. */}
        <ListCardGroup>
          {rows.map(({ asset, hasQr, hasActiveQr, pageStatus, activeSessionId }) => (
            <ListCard
              key={asset.id}
              title={
                <span className="flex items-center gap-3">
                  <AssetThumb src={asset.cover_image_url} alt={`Photo of ${asset.asset_name}`} />
                  <AssetCodeChip code={asset.asset_code} />
                </span>
              }
              meta={asset.asset_name}
              status={
                <>
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
                </>
              }
              actions={
                <>
                  <Link
                    href={withReturnTo(`/dashboard/assets/${asset.id}`, listHref)}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    View / edit
                  </Link>
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
                      assetName={asset.asset_name}
                      assetCode={asset.asset_code}
                      unresolvedCount={unresolvedByAsset.get(asset.id) ?? 0}
                      redirectTo={listHref}
                    />
                  )}
                </>
              }
            >
              <ListCardMeta label="Category" value={asset.category ?? "—"} />
            </ListCard>
          ))}
        </ListCardGroup>
        </>
      )}
    </div>
  );
}
