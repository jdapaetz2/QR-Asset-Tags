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
