import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import {
  isExportTypeKey,
  isExportTypeEnabled,
  toExportFlags,
} from "@/lib/export/types";
import { runExport } from "@/lib/export/run";

// Per-request, auth-scoped download — never cache.
export const dynamic = "force-dynamic";

/**
 * Customer self-serve export. Gated server-side: the master flag AND the requested
 * type flag must be enabled for the caller's org (never trust the UI). RLS scopes
 * the read to the caller's organization — no service-role, no cross-org data.
 */
export async function GET(request: NextRequest) {
  await requireOrgId();

  const type = request.nextUrl.searchParams.get("type") ?? "";
  if (!isExportTypeKey(type)) {
    return new Response("Unknown export type.", { status: 400 });
  }

  const supabase = await createClient();

  // RLS-scoped read of the caller's own org flags.
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "customer_exports_enabled, export_assets_enabled, export_qr_mapping_enabled, export_documents_enabled, export_submissions_enabled"
    )
    .maybeSingle();
  const flags = toExportFlags(org);

  if (!isExportTypeEnabled(flags, type)) {
    return new Response("Exports are not enabled for this organization.", {
      status: 403,
    });
  }

  // No organizationId → RLS scopes to the caller's org.
  const { filename, csv } = await runExport(supabase, type, {
    baseUrl: publicEnv.siteUrl,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
