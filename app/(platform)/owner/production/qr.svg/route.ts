import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { buildQrSvg, sanitizeSvgFilename, type QrLogo } from "@/lib/qr/svg";
import {
  clampLogoPercent,
  validateLogoFile,
  LOGO_ALLOWED_TYPES,
  LOGO_MAX_BYTES,
} from "@/lib/qr/branded";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type SvgOptions = {
  ec?: string | null;
  size?: string | null;
  fg?: string | null;
  bg?: string | null;
  logo?: QrLogo | null;
};

/** Resolve a QR link (owner RLS) and return its scan SVG as a download. */
async function svgResponse(
  supabase: SupabaseClient,
  shortCode: string,
  options: SvgOptions
): Promise<Response> {
  if (!shortCode) return new Response("Missing short code", { status: 400 });

  const { data: link } = await supabase
    .from("qr_links")
    .select("asset_id, short_code")
    .eq("short_code", shortCode)
    .maybeSingle();
  if (!link) return new Response("QR link not found", { status: 404 });

  const { data: asset } = await supabase
    .from("assets")
    .select("asset_code")
    .eq("id", link.asset_id)
    .maybeSingle();
  const assetCode = asset?.asset_code ?? "asset";

  // Always the computed URL — never qr_links.public_url.
  const url = buildPublicQrUrl(publicEnv.siteUrl, link.short_code);
  const svg = await buildQrSvg(url, options);
  const filename = sanitizeSvgFilename(assetCode, link.short_code);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// Scan-safe export (no logo). AssetTag QR platform admin only.
export async function GET(request: NextRequest) {
  await requireRole(ROLES.PLATFORM_OWNER);
  const sp = request.nextUrl.searchParams;
  const supabase = await createClient();
  return svgResponse(supabase, sp.get("short") ?? "", {
    ec: sp.get("ec"),
    size: sp.get("size"),
  });
}

// Branded export (multipart): colors + optional logo. Logo always forces EC H.
export async function POST(request: NextRequest) {
  await requireRole(ROLES.PLATFORM_OWNER);

  const form = await request.formData();
  const shortCode = String(form.get("short") ?? "");
  const size = String(form.get("size") ?? "");
  const fg = String(form.get("fg") ?? "");
  const bg = String(form.get("bg") ?? "");
  const logoSource = String(form.get("logoSource") ?? "none");
  const logoPct = clampLogoPercent(Number(form.get("logoPct")));

  const supabase = await createClient();

  // Need organization_id (for org logo) — resolve once here.
  const { data: link } = await supabase
    .from("qr_links")
    .select("organization_id, short_code")
    .eq("short_code", shortCode)
    .maybeSingle();
  if (!link) return new Response("QR link not found", { status: 404 });

  let logo: QrLogo | null = null;

  if (logoSource === "upload") {
    const file = form.get("logo");
    if (file && typeof file !== "string" && file.size > 0) {
      const fileError = validateLogoFile({ type: file.type, size: file.size });
      if (fileError) return new Response(fileError, { status: 400 });
      const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      logo = { dataUri: `data:${file.type};base64,${b64}`, pct: logoPct };
    }
  } else if (logoSource === "org") {
    const { data: org } = await supabase
      .from("organizations")
      .select("logo_url")
      .eq("id", link.organization_id)
      .maybeSingle();
    if (org?.logo_url) {
      logo = await fetchLogoDataUri(org.logo_url, logoPct);
    }
  }

  // Branded/logo exports always use error correction H (scanability over styling).
  return svgResponse(supabase, shortCode, { ec: "H", size, fg, bg, logo });
}

/** Best-effort fetch + embed of an org logo URL. Returns null on any problem. */
async function fetchLogoDataUri(logoUrl: string, pct: number): Promise<QrLogo | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    const mime = (LOGO_ALLOWED_TYPES as readonly string[]).find((t) =>
      ct.includes(t)
    );
    if (!mime) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > LOGO_MAX_BYTES) return null;
    return { dataUri: `data:${mime};base64,${buf.toString("base64")}`, pct };
  } catch {
    return null;
  }
}
