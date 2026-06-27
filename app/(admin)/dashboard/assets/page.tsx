import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrgCategories } from "@/lib/assets/categories";
import { startRentalSession, closeRentalSession } from "@/lib/rentals/actions";
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
  ASSET_SORTS,
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
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

const selectClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

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
      "id, asset_code, asset_name, category, make, model, public_status, created_at, archived_at"
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

  // Distinct, normalized categories for the filter dropdown (own org only).
  const categories = await getOrgCategories(supabase);

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

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} asset{rows.length === 1 ? "" : "s"}
            {filtersActive ? " (filtered)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/assets/import">Import CSV</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/assets/new">New asset</Link>
          </Button>
        </div>
      </section>

      {/* Search + filters + sort (GET form, mobile-friendly wrap) */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm" style={{ minWidth: "12rem" }}>
          <span className="text-muted-foreground">Search</span>
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Code, name, category, make, model, serial…"
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Visibility</span>
          <select name="status" defaultValue={params.publicStatus} className={selectClass}>
            {PUBLIC_STATUS_FILTERS.map((v) => (
              <option key={v} value={v}>
                {v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Category</span>
          <select name="category" defaultValue={params.category} className={selectClass}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">QR</span>
          <select name="qr" defaultValue={params.qr} className={selectClass}>
            {QR_FILTERS.map((v) => (
              <option key={v} value={v}>
                {v === "all" ? "All" : v === "has" ? "Has QR" : "Missing QR"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Page</span>
          <select name="page" defaultValue={params.page} className={selectClass}>
            {PAGE_FILTERS.map((v) => (
              <option key={v} value={v}>
                {v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Lifecycle</span>
          <select name="lifecycle" defaultValue={params.lifecycle} className={selectClass}>
            {LIFECYCLE_FILTERS.map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Rental</span>
          <select name="rental" defaultValue={params.rental} className={selectClass}>
            {RENTAL_FILTERS.map((v) => (
              <option key={v} value={v}>
                {v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select name="sort" defaultValue={params.sort} className={selectClass}>
            {ASSET_SORTS.map((v) => (
              <option key={v} value={v}>
                {SORT_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Apply
        </button>
        <Link
          href="/dashboard/assets"
          className="px-1 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6">
                  {filtersActive ? (
                    <EmptyState
                      title="No assets match these filters"
                      description="Try clearing the search or filters to see all of your equipment."
                    />
                  ) : (
                    <EmptyState
                      title="No assets yet"
                      description="Assets are your rental equipment records — each one gets a QR page renters can scan. Add your first asset or import a CSV to get started."
                      action={
                        <Link
                          href="/dashboard/assets/new"
                          className="text-sm underline-offset-4 hover:underline"
                        >
                          Add an asset →
                        </Link>
                      }
                    />
                  )}
                </td>
              </tr>
            ) : (
              rows.map(({ asset, hasQr, hasActiveQr, pageStatus, activeSessionId }) => (
                <tr key={asset.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 font-medium">
                    {asset.asset_code}
                  </td>
                  <td className="px-4 py-2">{asset.asset_name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {asset.category ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={activeSessionId ? "warning" : "neutral"}>
                        {activeSessionId ? "Rented" : "Available"}
                      </Badge>
                      <Badge tone={asset.public_status === "public" ? "success" : "neutral"}>
                        {asset.public_status === "public" ? "Public" : "Private"}
                      </Badge>
                      <Badge tone={hasActiveQr ? "success" : "warning"}>
                        {hasActiveQr ? "QR ready" : hasQr ? "QR inactive" : "No QR"}
                      </Badge>
                      <Badge tone={pageStatus === "published" ? "success" : "warning"}>
                        {pageStatus === "published"
                          ? "Page live"
                          : pageStatus === "draft"
                            ? "Page draft"
                            : "No page"}
                      </Badge>
                      {asset.archived_at ? (
                        <Badge tone="warning">Archived</Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {formatDate(asset.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
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
                        <ActionButton
                          action={startRentalSession.bind(null, asset.id, listHref)}
                          variant="outline"
                        >
                          Mark rented
                        </ActionButton>
                      )}
                      <Link
                        href={`/dashboard/assets/${asset.id}`}
                        className="text-sm underline-offset-4 hover:underline"
                      >
                        View / edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
