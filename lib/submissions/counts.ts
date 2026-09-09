/**
 * Single source of truth for the "new submissions" figure (Phase 3C.4).
 *
 * The authenticated navigation badge and the submissions-inbox "X new" pill must always agree, so both call this
 * one helper instead of duplicating the query. "New" means exactly `status = 'new'` — NOT reviewed, resolved, or
 * archived. (The dashboard's separate "unresolved" stat = new + reviewed is a different metric and intentionally
 * keeps its own query.) RLS scopes the count to the caller's organization; no service role.
 */
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function countNewSubmissions(supabase: ServerClient): Promise<number> {
  const { count } = await supabase
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return count ?? 0;
}

/**
 * The newest submission's `created_at` for the caller's organization, or null when there are none.
 *
 * Phase C7. This is the second half of the inbox freshness token, and it exists because **the count
 * alone is not sufficient**: if one submission arrives while another is resolved in the same interval,
 * the `status='new'` count is unchanged and a count-only token would report "nothing happened" while a
 * new row sat unseen in the inbox.
 *
 * Conversely a timestamp alone would miss every status change, so neither value is dropped. Both are
 * already visible to this same admin in the inbox, so the pair discloses nothing new.
 *
 * One row, one column, RLS-scoped, no service role.
 */
export async function latestSubmissionAt(supabase: ServerClient): Promise<string | null> {
  const { data } = await supabase
    .from("form_submissions")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>();
  return data?.created_at ?? null;
}
