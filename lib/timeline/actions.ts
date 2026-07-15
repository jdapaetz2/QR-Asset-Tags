"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { isLikelyUuid } from "@/lib/rentals/evidence";
import { decodeCursor, type TimelineFilters } from "@/lib/timeline/cursor";
import {
  createTimelineQueryClient,
  getAssetTimelinePage,
  type TimelinePage,
} from "@/lib/timeline/timeline-page";

export type TimelinePageResult = {
  events: TimelinePage["events"];
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * Load the NEXT bounded page of an asset's timeline (Phase 3C.8, Part F). Called by the client "Load 50 more"
 * button — one request per click, never on an interval or scroll. Auth + org scope enforced server-side; the
 * asset id is validated and its org read is RLS-scoped, so a cross-org id yields an empty page, never data.
 * `filters` is the already-resolved filter object from the page (so relative date windows stay stable between
 * pages — the cursor `now` is not re-evaluated here).
 */
export async function loadMoreAssetTimeline(
  assetId: string,
  cursor: string | null,
  filters: TimelineFilters
): Promise<TimelinePageResult> {
  await requireOrgId();
  if (!isLikelyUuid(assetId)) return { events: [], nextCursor: null, hasMore: false };

  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("assets")
    .select("created_at, archived_at")
    .eq("id", assetId)
    .maybeSingle<{ created_at: string | null; archived_at: string | null }>();
  if (!asset) return { events: [], nextCursor: null, hasMore: false };

  const page = await getAssetTimelinePage({
    client: createTimelineQueryClient(supabase),
    assetId,
    assetCreatedAt: asset.created_at ?? null,
    archivedAt: asset.archived_at ?? null,
    cursor: decodeCursor(cursor),
    filters,
  });
  return { events: page.events, nextCursor: page.nextCursor, hasMore: page.hasMore };
}
