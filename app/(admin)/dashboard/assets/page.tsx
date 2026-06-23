import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import {
  parseAssetListParams,
  sanitizeSearch,
  assetPageStatus,
  matchesQrFilter,
  matchesPageFilter,
  PUBLIC_STATUS_FILTERS,
  QR_FILTERS,
  PAGE_FILTERS,
  LIFECYCLE_FILTERS,
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

function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "ok" | "warn";
}) {
  const styles =
    tone === "ok"
      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "border-amber-500/40 text-amber-700 dark:text-amber-500"
        : "text-muted-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${styles}`}>
      {children}
    </span>
  );
}

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

  // Distinct categories for the filter dropdown (across all of the org's assets).
  const { data: catData } = await supabase.from("assets").select("category");
  const categories = Array.from(
    new Set(
      (catData ?? [])
        .map((c) => (c as { category: string | null }).category)
        .filter((c): c is string => Boolean(c))
    )
  ).sort();

  const rows = allRows
    .map((asset) => {
      const hasQr = qrByAsset.has(asset.id);
      const hasActiveQr = qrByAsset.get(asset.id)?.hasActive ?? false;
      const pageStatus = assetPageStatus(
        pageByAsset.has(asset.id),
        pageByAsset.get(asset.id) ?? false
      );
      return { asset, hasQr, hasActiveQr, pageStatus };
    })
    .filter(
      (r) =>
        matchesQrFilter(params.qr, r.hasQr) &&
        matchesPageFilter(params.page, r.pageStatus)
    );

  const filtersActive =
    Boolean(params.q) ||
    params.publicStatus !== "all" ||
    Boolean(params.category) ||
    params.qr !== "all" ||
    params.page !== "all" ||
    params.lifecycle !== "active";

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
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  {filtersActive
                    ? "No assets match these filters."
                    : "No assets yet. Create your first one or import a CSV."}
                </td>
              </tr>
            ) : (
              rows.map(({ asset, hasQr, hasActiveQr, pageStatus }) => (
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
                      <Badge tone={asset.public_status === "public" ? "ok" : "muted"}>
                        {asset.public_status === "public" ? "Public" : "Private"}
                      </Badge>
                      <Badge tone={hasActiveQr ? "ok" : "warn"}>
                        {hasActiveQr ? "QR ready" : hasQr ? "QR inactive" : "No QR"}
                      </Badge>
                      <Badge
                        tone={pageStatus === "published" ? "ok" : "warn"}
                      >
                        {pageStatus === "published"
                          ? "Page live"
                          : pageStatus === "draft"
                            ? "Page draft"
                            : "No page"}
                      </Badge>
                      {asset.archived_at ? <Badge tone="warn">Archived</Badge> : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {formatDate(asset.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Link
                      href={`/dashboard/assets/${asset.id}`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      View / edit
                    </Link>
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
