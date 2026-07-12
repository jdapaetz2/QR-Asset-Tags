/**
 * Shared server-side fetch for the production CSV and printable sheet. Reads
 * through the RLS server client (platform owner sees all orgs via the
 * `is_platform_owner()` policy bypass) and shapes one `ProductionAssetRow` per
 * selected asset, with the computed scan URL. No service-role, no new tables.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { buildPublicQrUrl } from "@/lib/qr/url";
import type { ProductionAssetRow } from "@/lib/qr/production-csv";

export type ProductionLinkRow = {
  short_code: string;
  status: string;
  is_production_primary: boolean;
};

/**
 * Deterministically choose the qr_link production should encode for an asset: the
 * production-primary link, else the first active link, else null. Migration 0023 guarantees at
 * most one primary per asset (partial unique index) and that it is active, so this is stable —
 * unlike the old "arbitrary first row" selection. Pure; used by every production surface.
 */
export function selectProductionLink<T extends ProductionLinkRow>(
  links: T[]
): T | null {
  const primary = links.find(
    (l) => l.is_production_primary && l.status === "active"
  );
  if (primary) return primary;
  return links.find((l) => l.status === "active") ?? null;
}

export async function getProductionAssets(
  supabase: SupabaseClient,
  orgId: string,
  selectIds: string[]
): Promise<{ orgName: string; rows: ProductionAssetRow[] }> {
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const orgName = (orgRow?.name as string | undefined) ?? "Organization";

  if (selectIds.length === 0) return { orgName, rows: [] };

  const { data: assetData } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name, category, make, model, public_status")
    .eq("organization_id", orgId)
    .in("id", selectIds)
    .order("asset_code", { ascending: true });
  const assets = (assetData ?? []) as {
    id: string;
    asset_code: string;
    asset_name: string;
    category: string | null;
    make: string | null;
    model: string | null;
    public_status: string;
  }[];

  const { data: qrData } = await supabase
    .from("qr_links")
    .select("asset_id, short_code, status, is_production_primary")
    .eq("organization_id", orgId);
  // Group ALL links per asset, then pick the production link deterministically (primary → active).
  const linksByAsset = new Map<string, ProductionLinkRow[]>();
  for (const q of (qrData ?? []) as (ProductionLinkRow & { asset_id: string })[]) {
    const list = linksByAsset.get(q.asset_id);
    if (list) list.push(q);
    else linksByAsset.set(q.asset_id, [q]);
  }

  const { data: pageData } = await supabase
    .from("equipment_pages")
    .select("asset_id, is_published")
    .eq("organization_id", orgId);
  const pageByAsset = new Map<string, boolean>();
  for (const p of (pageData ?? []) as {
    asset_id: string;
    is_published: boolean;
  }[]) {
    pageByAsset.set(p.asset_id, p.is_published);
  }

  const { data: docData } = await supabase
    .from("documents")
    .select("asset_id, document_type")
    .eq("organization_id", orgId)
    .eq("visibility", "public");
  const manualByAsset = new Set<string>();
  const startupByAsset = new Set<string>();
  for (const d of (docData ?? []) as {
    asset_id: string;
    document_type: string;
  }[]) {
    if (d.document_type === "manual") manualByAsset.add(d.asset_id);
    if (d.document_type === "startup_guide") startupByAsset.add(d.asset_id);
  }

  const rows: ProductionAssetRow[] = assets.map((asset) => {
    const qr = selectProductionLink(linksByAsset.get(asset.id) ?? []);
    return {
      organization_name: orgName,
      asset_code: asset.asset_code,
      asset_name: asset.asset_name,
      category: asset.category,
      make: asset.make,
      model: asset.model,
      short_code: qr?.short_code ?? null,
      short_url: qr ? buildPublicQrUrl(publicEnv.siteUrl, qr.short_code) : null,
      qr_status: qr?.status ?? "missing",
      asset_public_status: asset.public_status,
      equipment_page_published: pageByAsset.get(asset.id) === true,
      manual_available: manualByAsset.has(asset.id),
      startup_guide_available: startupByAsset.has(asset.id),
    };
  });

  return { orgName, rows };
}
