import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { isExportTypeKey } from "@/lib/export/types";
import { runExport } from "@/lib/export/run";

// Per-request, auth-scoped download — never cache.
export const dynamic = "force-dynamic";

/**
 * Platform-owner export for an org (support/offboarding). Always allowed — does not
 * depend on the customer-export toggles. The query is scoped to the given org id; the
 * owner uses its normal platform-owner RLS (no service-role).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  await requireRole(ROLES.PLATFORM_OWNER);
  const { organizationId } = await params;

  const type = request.nextUrl.searchParams.get("type") ?? "";
  if (!isExportTypeKey(type)) {
    return new Response("Unknown export type.", { status: 400 });
  }

  const supabase = await createClient();
  const { filename, csv } = await runExport(supabase, type, {
    organizationId,
    baseUrl: publicEnv.siteUrl,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
