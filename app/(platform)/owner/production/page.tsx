import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { isProductionBaseUrl, assetReadiness } from "@/lib/qr/production";
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
  // AssetTag QR platform admin only.
  await requireRole(ROLES.PLATFORM_OWNER);

  const sp = await searchParams;
  const orgId = firstString(sp.org);
  const selectedIds = asArray(sp.select);
  const ec = normalizeErrorCorrection(firstString(sp.ec));
  const size = SIZE_OPTIONS.includes(firstString(sp.size) as never)
    ? firstString(sp.size)
    : "2.0";

  const baseUrl = publicEnv.siteUrl;
  const baseIsProd = isProductionBaseUrl(baseUrl);

  const supabase = await createClient();

  const header = (
    <section className="flex flex-col gap-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Production</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AssetTag QR Admin · QR/tag production
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
    .order("asset_code", { ascending: true });
  const assets = (assetData ?? []) as AssetRow[];

  const { data: qrData } = await supabase
    .from("qr_links")
    .select("asset_id, short_code, status")
    .eq("organization_id", orgId);
  const qrByAsset = new Map<string, { short_code: string; status: string }>();
  for (const q of (qrData ?? []) as { asset_id: string; short_code: string; status: string }[]) {
    if (!qrByAsset.has(q.asset_id)) qrByAsset.set(q.asset_id, q);
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
    const readiness = assetReadiness({
      public_status: asset.public_status,
      qrStatus: qr?.status ?? null,
      pageStatus,
    });
    const qrUrl = qr ? buildPublicQrUrl(baseUrl, qr.short_code) : null;
    return { asset, qr, pageStatus, readiness, qrUrl };
  });

  const selected = rows.filter((r) => selectedIds.includes(r.asset.id));

  const sheetParams = new URLSearchParams();
  sheetParams.set("org", orgId);
  sheetParams.set("ec", ec);
  sheetParams.set("size", size);
  for (const s of selected) sheetParams.append("select", s.asset.id);
  const sheetHref = `/owner/production/qr-sheet.svg?${sheetParams.toString()}`;

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
        <Link
          href="/owner/production"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All organizations
        </Link>
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
        </div>
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
                rows.map(({ asset, qr, pageStatus, readiness, qrUrl }) => (
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
                    <td className="px-3 py-2 font-medium">{asset.asset_code}</td>
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
                      {readiness.ready ? (
                        <span className="rounded-full border px-2 py-0.5 text-xs">
                          Ready
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {readiness.issues.join(", ")}
                        </span>
                      )}
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
                <li key={asset.id} className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{asset.asset_code}</span>
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
            <a
              href={sheetHref}
              className="mt-3 inline-flex rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Download SVG sheet
            </a>
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
