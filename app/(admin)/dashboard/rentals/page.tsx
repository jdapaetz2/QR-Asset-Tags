import { requireOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createSessionBrowserClient,
  getRentalSessionsPage,
  parseSessionFilters,
} from "@/lib/rentals/session-browser";
import { currentListHref } from "@/lib/nav/return-to";
import { SessionFiltersCard } from "@/components/rentals/session-filters";
import { SessionBrowserList } from "@/components/rentals/session-browser-list";

export const dynamic = "force-dynamic";

/**
 * Organization rental-session browser (Phase 3C.8, Part J). A lightweight authenticated index/search over the
 * org's rental sessions — find one by RNT reference, browse recent sessions, open evidence directly. NOT a
 * booking / rental-order manager. RLS scopes every read to the caller's org; cursor pagination bounds each page.
 */
export default async function RentalSessionsBrowserPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireOrgId();
  const sp = await searchParams;
  const filters = parseSessionFilters(sp, new Date());

  const supabase = await createClient();
  const page = await getRentalSessionsPage({
    client: createSessionBrowserClient(supabase),
    cursor: null,
    filters,
  });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Rental sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search by RNT reference and open a session&apos;s evidence record.
        </p>
      </section>

      <SessionFiltersCard filters={filters} />

      {/* The list owns every empty + end-of-results state (Phase 3C.8.1), so the copy stays filter-accurate and
          never implies older sessions don't exist outside a date range. */}
      <SessionBrowserList
        initialSessions={page.sessions}
        initialCursor={page.nextCursor}
        initialHasMore={page.hasMore}
        filters={filters}
        clearHref={filters.assetId ? `/dashboard/rentals?asset=${filters.assetId}` : "/dashboard/rentals"}
        returnTo={currentListHref("/dashboard/rentals", sp)}
      />
    </div>
  );
}
