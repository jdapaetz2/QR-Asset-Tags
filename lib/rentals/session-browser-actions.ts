"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { decodeCursor } from "@/lib/timeline/cursor";
import {
  createSessionBrowserClient,
  getRentalSessionsPage,
  type SessionBrowserPage,
  type SessionFilters,
} from "@/lib/rentals/session-browser";

export type SessionBrowserPageResult = {
  sessions: SessionBrowserPage["sessions"];
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * Load the NEXT bounded page of the organization rental-session browser (Phase 3C.8, Part J). One request per
 * "Load 50 more" click. Auth + org scope enforced server-side (RLS); no service role. `filters` is the resolved
 * filter object from the page so relative date windows stay stable across pages.
 */
export async function loadMoreRentalSessions(
  cursor: string | null,
  filters: SessionFilters
): Promise<SessionBrowserPageResult> {
  await requireOrgId();
  const supabase = await createClient();
  const page = await getRentalSessionsPage({
    client: createSessionBrowserClient(supabase),
    cursor: decodeCursor(cursor),
    filters,
  });
  return { sessions: page.sessions, nextCursor: page.nextCursor, hasMore: page.hasMore };
}
