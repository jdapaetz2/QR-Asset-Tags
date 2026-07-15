import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { buildPublicQrUrl } from "@/lib/qr/url";
import {
  selectProductionLink,
  type ProductionLinkRow,
} from "@/lib/qr/production-data";
import {
  isProductionBaseUrl,
  TAG_SIZE_OPTIONS,
  MATERIAL_OPTIONS,
  MOUNTING_OPTIONS,
} from "@/lib/qr/production";
import { deriveAssetStatus } from "@/lib/ui/status-view";
import { ReadinessIndicator } from "@/components/ui/asset-status-cell";
import { AssetCodeChip } from "@/components/ui/asset-code-chip";
import { secondaryActionClass } from "@/components/ui/secondary-action-link";
import {
  EC_OPTIONS,
  SIZE_OPTIONS,
  normalizeErrorCorrection,
} from "@/lib/qr/svg";
import { BrandedExportForm } from "@/components/qr/branded-export-form";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type OrgRow = { id: string; name: string; slug: string; status: string };
type AssetRow = {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string | null;
  public_status: string;
};

function firstString(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function asArray(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

const selectClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Mulemark platform admin only.
  await requireRole(ROLES.PLATFORM_OWNER);

  const sp = await searchParams;
  const orgId = firstString(sp.org);
  const selectedIds = asArray(sp.select);
  const ec = normalizeErrorCorrection(firstString(sp.ec));
  const size = SIZE_OPTIONS.includes(firstString(sp.size) as never)
    ? firstString(sp.size)
    : "2.0";

  // Batch tag metadata (non-persistent — carried in query params only).
  const tagSize = firstString(sp.tag_size);
  const material = firstString(sp.material);
  const mounting = firstString(sp.mounting_method);
  const productionNotes = firstString(sp.production_notes);

  const baseUrl = publicEnv.siteUrl;
  const baseIsProd = isProductionBaseUrl(baseUrl);

  const supabase = await createClient();

  const header = (
    <section className="flex flex-col gap-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Production</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mulemark Admin · QR/tag production
        </p>
      </div>
      <div className="rounded-lg border bg-card p-3 text-sm">
        <span className="text-muted-foreground">Tag base URL: </span>
        <code className="font-mono">{baseUrl}</code>
        {!baseIsProd ? (
          <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
            Do not use this URL for physical tags unless this is intentional.
          </p>
        ) : null}
      </div>
    </section>
  );

  // ---- Organization picker (no org selected) -------------------------------
  if (!orgId) {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("id, name, slug, status")
      .order("name", { ascending: true });
    const orgs = (orgData ?? []) as OrgRow[];

    // Owner RLS sees all orgs' rows; count per org in JS.
    const { data: assetData } = await supabase
      .from("assets")
      .select("id, organization_id");
    const { data: qrData } = await supabase
      .from("qr_links")
      .select("id, organization_id");

    const assetCounts = new Map<string, number>();
    for (const a of (assetData ?? []) as { organization_id: string }[]) {
      assetCounts.set(a.organization_id, (assetCounts.get(a.organization_id) ?? 0) + 1);
    }
    const qrCounts = new Map<string, number>();
    for (const q of (qrData ?? []) as { organization_id: string }[]) {
      qrCounts.set(q.organization_id, (qrCounts.get(q.organization_id) ?? 0) + 1);
    }

    return (
      <div className="flex flex-col gap-6">
        {header}
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Select an organization
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Slug</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Assets</th>
                  <th className="px-4 py-2 font-medium">QR links</th>
                  <th className="px-4 py-2 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      No organizations yet.
                    </td>
                  </tr>
                ) : (
                  orgs.map((org) => (
                    <tr key={org.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{org.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{org.slug}</td>
                      <td className="px-4 py-2">{org.status}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {assetCounts.get(org.id) ?? 0}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {qrCounts.get(org.id) ?? 0}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/owner/production?org=${org.id}`}
                          className="text-sm underline-offset-4 hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  // ---- Selected organization: asset production list ------------------------
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name, logo_url")
    .eq("id", orgId)
    .maybeSingle();

  const { data: assetData } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name, category, public_status")
    .eq("organization_id", orgId)
    // Archived (retired) assets are not offered for tag production.
    .is("archived_at", null)
    .order("asset_code", { ascending: true });
  const assets = (assetData ?? []) as AssetRow[];

  const { data: qrData } = await supabase
    .from("qr_links")
    .select("asset_id, short_code, status, is_production_primary")
    .eq("organization_id", orgId);
  // Group all links per asset, then pick the production link deterministically (primary → active).
  const qrLinksByAsset = new Map<string, ProductionLinkRow[]>();
  for (const q of (qrData ?? []) as (ProductionLinkRow & { asset_id: string })[]) {
    const list = qrLinksByAsset.get(q.asset_id);
    if (list) list.push(q);
    else qrLinksByAsset.set(q.asset_id, [q]);
  }
  const qrByAsset = new Map<string, { short_code: string; status: string }>();
  for (const [assetId, links] of qrLinksByAsset) {
    const chosen = selectProductionLink(links);
    if (chosen) {
      qrByAsset.set(assetId, {
        short_code: chosen.short_code,
        status: chosen.status,
      });
    }
  }

  const { data: pageData } = await supabase
    .from("equipment_pages")
    .select("asset_id, is_published")
    .eq("organization_id", orgId);
  const pageByAsset = new Map<string, boolean>();
  for (const p of (pageData ?? []) as { asset_id: string; is_published: boolean }[]) {
    pageByAsset.set(p.asset_id, p.is_published);
  }

  const { data: docData } = await supabase
    .from("documents")
    .select("asset_id")
    .eq("organization_id", orgId)
    .eq("visibility", "public");
  const docCount = new Map<string, number>();
  for (const d of (docData ?? []) as { asset_id: string }[]) {
    docCount.set(d.asset_id, (docCount.get(d.asset_id) ?? 0) + 1);
  }

  function pageStatusFor(assetId: string): "published" | "draft" | "missing" {
    if (!pageByAsset.has(assetId)) return "missing";
    return pageByAsset.get(assetId) ? "published" : "draft";
  }

  const rows = assets.map((asset) => {
    const qr = qrByAsset.get(asset.id) ?? null;
    const pageStatus = pageStatusFor(asset.id);
    // Display view-model (A2). Production lists only non-archived assets and doesn't show
    // rental state, so rented=false/archivedAt=null; readiness matches the canonical rules.
    const status = deriveAssetStatus({
      rented: false,
      publicStatus: asset.public_status,
      qrStatus: (qr?.status as "active" | "disabled" | null | undefined) ?? null,
      pageStatus,
    });
    const qrUrl = qr ? buildPublicQrUrl(baseUrl, qr.short_code) : null;
    return { asset, qr, pageStatus, status, qrUrl };
  });

  const selected = rows.filter((r) => selectedIds.includes(r.asset.id));

  const exportParams = new URLSearchParams();
  exportParams.set("org", orgId);
  exportParams.set("ec", ec);
  exportParams.set("size", size);
  if (tagSize) exportParams.set("tag_size", tagSize);
  if (material) exportParams.set("material", material);
  if (mounting) exportParams.set("mounting_method", mounting);
  if (productionNotes) exportParams.set("production_notes", productionNotes);
  for (const s of selected) exportParams.append("select", s.asset.id);
  const query = exportParams.toString();
  const sheetHref = `/owner/production/qr-sheet.svg?${query}`;
  const csvHref = `/owner/production/export.csv?${query}`;
  const productionSheetHref = `/owner/production/sheet?${query}`;

  // Assets that have a QR link, for the optional branded export.
  const qrAssets = rows
    .filter((r) => r.qr && r.qrUrl)
    .map((r) => ({
      id: r.asset.id,
      asset_code: r.asset.asset_code,
      short_code: r.qr!.short_code,
      qrUrl: r.qrUrl!,
    }));
  const orgHasLogo = Boolean(orgRow?.logo_url);

  return (
    <div className="flex flex-col gap-6">
      {header}

      <section>
        {/* Org context preserved (Wave 3N.4): the primary return goes back to this org's hub; switching
            organizations is an explicit secondary action, not an unexpected drop to the picker. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link
            href={`/owner/organizations/${orgId}`}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Back to {orgRow?.name ?? "organization"}
          </Link>
          <Link
            href="/owner/production"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Switch organization
          </Link>
        </div>
        <h2 className="mt-2 text-lg font-semibold">
          {orgRow?.name ?? "Organization"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {assets.length} asset{assets.length === 1 ? "" : "s"}
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="font-medium">Scan-safe equipment tag</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Black-on-white, square modules, high error correction, quiet zone — no
          logo or styling. This is the default export.
        </p>
        <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
          <li>
            Higher error correction improves resilience but can make the QR denser.
            Use larger physical tags for dense QR codes.
          </li>
          <li>Final physical tag size must be tested after engraving/printing.</li>
        </ul>
      </section>

      <form method="get" className="flex flex-col gap-3">
        <input type="hidden" name="org" value={orgId} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Error correction</span>
            <select name="ec" defaultValue={ec} className={selectClass}>
              {EC_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Size (in)</span>
            <select name="size" defaultValue={size} className={selectClass}>
              {SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Tag size</span>
            <select name="tag_size" defaultValue={tagSize} className={selectClass}>
              <option value="">—</option>
              {TAG_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Material</span>
            <select name="material" defaultValue={material} className={selectClass}>
              <option value="">—</option>
              {MATERIAL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Mounting</span>
            <select
              name="mounting_method"
              defaultValue={mounting}
              className={selectClass}
            >
              <option value="">—</option>
              {MOUNTING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Production notes (batch)</span>
          <input
            type="text"
            name="production_notes"
            defaultValue={productionNotes}
            placeholder="Applies to the whole batch on the CSV and sheet"
            className={selectClass}
          />
        </label>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium sr-only">Select</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Visibility</th>
                <th className="px-3 py-2 font-medium">QR</th>
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 font-medium">Docs</th>
                <th className="px-3 py-2 font-medium">Readiness</th>
                <th className="px-3 py-2 font-medium">Tag URL</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                    No assets for this organization.
                  </td>
                </tr>
              ) : (
                rows.map(({ asset, qr, pageStatus, status, qrUrl }) => (
                  <tr key={asset.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        name="select"
                        value={asset.id}
                        defaultChecked={selectedIds.includes(asset.id)}
                        className="size-4"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <AssetCodeChip code={asset.asset_code} />
                    </td>
                    <td className="px-3 py-2">
                      {asset.asset_name}
                      {asset.category ? (
                        <span className="block text-xs text-muted-foreground">
                          {asset.category}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{asset.public_status}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {qr ? `${qr.short_code} · ${qr.status}` : "Missing"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{pageStatus}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {docCount.get(asset.id) ?? 0}
                    </td>
                    <td className="px-3 py-2">
                      <ReadinessIndicator readiness={status.readiness} />
                    </td>
                    <td className="px-3 py-2">
                      {qrUrl && qr ? (
                        <div className="flex flex-col gap-1">
                          <code className="font-mono text-xs">{qrUrl}</code>
                          <a
                            href={`/owner/production/qr.svg?short=${encodeURIComponent(
                              qr.short_code
                            )}&ec=${ec}&size=${size}`}
                            className="text-xs underline-offset-4 hover:underline"
                          >
                            Download SVG
                          </a>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div>
          <button
            type="submit"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Update selection
          </button>
        </div>
      </form>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-medium">
          Selected for production ({selected.length})
        </h2>
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Select assets above to build a production list.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1 text-sm">
              {selected.map(({ asset, qrUrl }) => (
                <li key={asset.id} className="flex flex-wrap items-center gap-2">
                  <AssetCodeChip code={asset.asset_code} />
                  {qrUrl ? (
                    <code className="font-mono text-xs">{qrUrl}</code>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      no QR link — not ready
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={sheetHref} className={secondaryActionClass}>
                Download SVG sheet
              </a>
              <a href={csvHref} className={secondaryActionClass}>
                Download CSV
              </a>
              <a
                href={productionSheetHref}
                target="_blank"
                rel="noopener noreferrer"
                className={secondaryActionClass}
              >
                Production sheet
              </a>
            </div>
            {!baseIsProd ? (
              <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
                This base URL is not suitable for physical production tags unless
                intentional.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 font-medium">Branded export (optional)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Scan-safe is the default. Branded QR codes (logo, colors) trade some
          robustness for branding — follow the scanability guidance below.
        </p>
        <BrandedExportForm
          assets={qrAssets}
          orgHasLogo={orgHasLogo}
          baseIsProd={baseIsProd}
        />
      </section>
    </div>
  );
}
