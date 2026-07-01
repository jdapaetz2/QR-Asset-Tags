import type { SupabaseClient } from "@supabase/supabase-js";

import { countCoveredAssets } from "@/lib/plans/coverage";

/**
 * Covered-asset count for the caller's organization (RLS-scoped — reads only their own
 * qr_links + assets). Covered = non-archived asset with >= 1 qr_links row. Thin I/O
 * wrapper around the pure `countCoveredAssets`. No service-role.
 */
export async function getCoveredCount(
  supabase: SupabaseClient
): Promise<number> {
  const [{ data: qr }, { data: assets }] = await Promise.all([
    supabase.from("qr_links").select("asset_id"),
    supabase.from("assets").select("id").is("archived_at", null),
  ]);
  return countCoveredAssets(
    ((assets ?? []) as { id: string }[]).map((a) => a.id),
    ((qr ?? []) as { asset_id: string }[]).map((q) => q.asset_id)
  );
}
