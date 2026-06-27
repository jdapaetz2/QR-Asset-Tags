import type { SupabaseClient } from "@supabase/supabase-js";

import { assetReadiness, type AssetReadiness } from "@/lib/qr/production";

/**
 * Shared RLS-scoped fetch for a tag request's detail: the request fields plus its
 * selected assets with per-asset readiness. Used by both the customer (read-only)
 * and the owner (queue) detail pages. RLS scopes visibility; the caller gates role.
 */

export type TagRequest = {
  id: string;
  organization_id: string;
  status: string;
  material: string | null;
  mounting_method: string | null;
  tag_size: string | null;
  quantity_notes: string | null;
  production_notes: string | null;
  created_at: string;
  delivered_at: string | null;
};

export type TagRequestAsset = {
  id: string;
  asset_code: string;
  asset_name: string;
  archived: boolean;
  readiness: AssetReadiness;
};

export async function getTagRequestDetail(
  supabase: SupabaseClient,
  tagRequestId: string
): Promise<{ request: TagRequest | null; assets: TagRequestAsset[] }> {
  const { data: requestRow } = await supabase
    .from("tag_requests")
    .select(
      "id, organization_id, status, material, mounting_method, tag_size, quantity_notes, production_notes, created_at, delivered_at"
    )
    .eq("id", tagRequestId)
    .maybeSingle();
  if (!requestRow) return { request: null, assets: [] };
  const request = requestRow as TagRequest;

  const { data: linkRows } = await supabase
    .from("tag_request_assets")
    .select("asset_id")
    .eq("tag_request_id", tagRequestId);
  const assetIds = (linkRows ?? []).map((r) => r.asset_id as string);
  if (assetIds.length === 0) return { request, assets: [] };

  const { data: assetRows } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name, public_status, archived_at")
    .in("id", assetIds)
    .order("asset_code", { ascending: true });

  const { data: qrRows } = await supabase
    .from("qr_links")
    .select("asset_id, status")
    .in("asset_id", assetIds);
  const qrByAsset = new Map<string, string>();
  for (const q of (qrRows ?? []) as { asset_id: string; status: string }[]) {
    // Prefer an active link if one exists.
    if (q.status === "active" || !qrByAsset.has(q.asset_id)) {
      qrByAsset.set(q.asset_id, q.status);
    }
  }

  const { data: pageRows } = await supabase
    .from("equipment_pages")
    .select("asset_id, is_published")
    .in("asset_id", assetIds);
  const pageByAsset = new Map<string, boolean>();
  for (const p of (pageRows ?? []) as {
    asset_id: string;
    is_published: boolean;
  }[]) {
    pageByAsset.set(p.asset_id, p.is_published);
  }

  const assets: TagRequestAsset[] = (
    (assetRows ?? []) as {
      id: string;
      asset_code: string;
      asset_name: string;
      public_status: string;
      archived_at: string | null;
    }[]
  ).map((a) => {
    const pageStatus = !pageByAsset.has(a.id)
      ? "missing"
      : pageByAsset.get(a.id)
        ? "published"
        : "draft";
    return {
      id: a.id,
      asset_code: a.asset_code,
      asset_name: a.asset_name,
      archived: Boolean(a.archived_at),
      readiness: assetReadiness({
        public_status: a.public_status,
        qrStatus: qrByAsset.get(a.id) ?? null,
        pageStatus,
      }),
    };
  });

  return { request, assets };
}
