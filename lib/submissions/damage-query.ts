import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  OPEN_DAMAGE_COLUMNS,
  openDamageSummaryByAsset,
  type OpenDamageRow,
  type OpenDamageSummary,
} from "@/lib/submissions/damage";
import { UNRESOLVED_STATUSES } from "@/lib/submissions/inbox";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Open-damage summary for a SINGLE asset (asset detail / submission detail). One RLS-scoped filtered query
 * — not a per-asset loop. Returns null when the asset has no open damage. No service-role.
 */
export async function getOpenDamageForAsset(
  supabase: ServerClient,
  assetId: string
): Promise<OpenDamageSummary | null> {
  const { data } = await supabase
    .from("form_submissions")
    .select(OPEN_DAMAGE_COLUMNS)
    .eq("asset_id", assetId)
    .in("status", UNRESOLVED_STATUSES as readonly string[]);
  const rows = (data ?? []) as OpenDamageRow[];
  return openDamageSummaryByAsset(rows).get(assetId) ?? null;
}
