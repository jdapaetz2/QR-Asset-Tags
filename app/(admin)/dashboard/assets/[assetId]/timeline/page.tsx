import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { isLikelyUuid } from "@/lib/rentals/evidence";
import { parseTimelineFilters } from "@/lib/timeline/cursor";
import { createTimelineQueryClient, getAssetTimelinePage } from "@/lib/timeline/timeline-page";
import { sanitizeReturnTo, withReturnTo } from "@/lib/nav/return-to";
import { AssetSubnav } from "@/components/assets/asset-subnav";
import { AssetCodeChip } from "@/components/ui/asset-code-chip";
import { TimelineFilters } from "@/components/timeline/timeline-filters";
import { TimelineList } from "@/components/timeline/timeline-list";

// Read-only, auth-scoped per request; never cache.
export const dynamic = "force-dynamic";

export default async function AssetTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireOrgId();
  const { assetId } = await params;
  if (!isLikelyUuid(assetId)) notFound();
  const sp = await searchParams;
  const returnToRaw = Array.isArray(sp.returnTo) ? sp.returnTo[0] : sp.returnTo;
  const returnTo = sanitizeReturnTo(returnToRaw) ?? undefined;
  const filters = parseTimelineFilters(sp, new Date());

  const supabase = await createClient();

  // RLS-scoped: a row from another org isn't returned → 404. Archived assets are still readable here.
  const { data: asset } = await supabase
    .from("assets")
    .select("asset_code, asset_name, created_at, archived_at")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) notFound();

  // First bounded page (≤50 events); the client Load-more control fetches subsequent pages.
  const page = await getAssetTimelinePage({
    client: createTimelineQueryClient(supabase),
    assetId,
    assetCreatedAt: asset.created_at ?? null,
    archivedAt: asset.archived_at ?? null,
    cursor: null,
    filters,
  });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href={withReturnTo(`/dashboard/assets/${assetId}`, returnTo)}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {asset.asset_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Timeline</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <AssetCodeChip code={asset.asset_code} />
          <span>{asset.asset_name}</span>
        </div>
      </section>

      <AssetSubnav assetId={assetId} current="timeline" returnTo={returnTo} />

      <TimelineFilters filters={filters} />

      {/* The list owns every empty + end-of-history state (Phase 3C.8.1), so the copy stays filter-accurate. */}
      <TimelineList
        assetId={assetId}
        initialEvents={page.events}
        initialCursor={page.nextCursor}
        initialHasMore={page.hasMore}
        filters={filters}
        clearHref={`/dashboard/assets/${assetId}/timeline`}
      />
    </div>
  );
}
