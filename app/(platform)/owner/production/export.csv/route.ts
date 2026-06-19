import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { normalizeErrorCorrection } from "@/lib/qr/svg";
import { QR_STYLE_PRESET } from "@/lib/qr/production";
import { getProductionAssets } from "@/lib/qr/production-data";
import {
  buildProductionCsv,
  type ProductionMeta,
} from "@/lib/qr/production-csv";

// Per-request, auth-scoped download — never cache.
export const dynamic = "force-dynamic";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "org"
  );
}

// Production CSV export. AssetTag QR platform admin only.
export async function GET(request: NextRequest) {
  await requireRole(ROLES.PLATFORM_OWNER);

  const sp = request.nextUrl.searchParams;
  const orgId = sp.get("org") ?? "";
  const selectIds = sp.getAll("select");
  if (!orgId) return new Response("Missing org", { status: 400 });
  if (selectIds.length === 0) {
    return new Response("Select at least one asset", { status: 400 });
  }

  const ec = normalizeErrorCorrection(sp.get("ec"));

  const supabase = await createClient();
  const { orgName, rows } = await getProductionAssets(supabase, orgId, selectIds);

  // Scan-safe defaults: branded production sheet/CSV is deferred.
  const meta: ProductionMeta = {
    tag_size: sp.get("tag_size") ?? "",
    material: sp.get("material") ?? "",
    mounting_method: sp.get("mounting_method") ?? "",
    qr_style_preset: QR_STYLE_PRESET,
    error_correction_level: ec,
    logo_enabled: "no",
    production_notes: sp.get("production_notes") ?? "",
  };

  const csv = buildProductionCsv(rows, meta);
  const filename = `assettag-production-${slugify(orgName)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
