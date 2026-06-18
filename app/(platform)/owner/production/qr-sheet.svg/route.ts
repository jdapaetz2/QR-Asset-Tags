import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { buildQrSheetSvg, type QrSheetItem } from "@/lib/qr/svg";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // AssetTag QR platform admin only.
  await requireRole(ROLES.PLATFORM_OWNER);

  const sp = request.nextUrl.searchParams;
  const orgId = sp.get("org") ?? "";
  const selectIds = sp.getAll("select");
  const ec = sp.get("ec");
  const size = sp.get("size");

  if (!orgId || selectIds.length === 0) {
    return new Response("Select assets to export", { status: 400 });
  }

  const supabase = await createClient();

  // RLS: owner sees all. Restrict to the chosen org's assets + their QR links.
  const { data: assetData } = await supabase
    .from("assets")
    .select("id, asset_code")
    .eq("organization_id", orgId)
    .in("id", selectIds);
  const assets = (assetData ?? []) as { id: string; asset_code: string }[];

  const { data: qrData } = await supabase
    .from("qr_links")
    .select("asset_id, short_code")
    .eq("organization_id", orgId);
  const shortByAsset = new Map<string, string>();
  for (const q of (qrData ?? []) as { asset_id: string; short_code: string }[]) {
    if (!shortByAsset.has(q.asset_id)) shortByAsset.set(q.asset_id, q.short_code);
  }

  // Keep the page's order; only include assets that actually have a QR link.
  const items: QrSheetItem[] = [];
  for (const id of selectIds) {
    const asset = assets.find((a) => a.id === id);
    const short = asset ? shortByAsset.get(asset.id) : undefined;
    if (asset && short) {
      items.push({
        label: asset.asset_code,
        url: buildPublicQrUrl(publicEnv.siteUrl, short),
      });
    }
  }

  if (items.length === 0) {
    return new Response("No QR links for the selected assets", { status: 400 });
  }

  const svg = await buildQrSheetSvg(items, { ec, size });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="qr-sheet.svg"',
    },
  });
}
