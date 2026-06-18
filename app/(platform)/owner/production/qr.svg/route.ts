import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { buildQrSvg, sanitizeSvgFilename } from "@/lib/qr/svg";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // AssetTag QR platform admin only.
  await requireRole(ROLES.PLATFORM_OWNER);

  const sp = request.nextUrl.searchParams;
  const shortCode = sp.get("short") ?? "";
  const ec = sp.get("ec");
  const size = sp.get("size");

  if (!shortCode) {
    return new Response("Missing short code", { status: 400 });
  }

  const supabase = await createClient();

  // RLS: owner sees all qr_links / assets.
  const { data: link } = await supabase
    .from("qr_links")
    .select("asset_id, short_code")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (!link) {
    return new Response("QR link not found", { status: 404 });
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("asset_code")
    .eq("id", link.asset_id)
    .maybeSingle();
  const assetCode = asset?.asset_code ?? "asset";

  // Always the computed URL — never qr_links.public_url.
  const url = buildPublicQrUrl(publicEnv.siteUrl, link.short_code);
  const svg = await buildQrSvg(url, { ec, size });
  const filename = sanitizeSvgFilename(assetCode, link.short_code);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
