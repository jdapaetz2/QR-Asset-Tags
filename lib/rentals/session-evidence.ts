/**
 * Authoritative rental-session evidence loader (Phase 3C.4).
 *
 * WHY THIS EXISTS: the previous evidence page loaded the session with an embedded `asset:assets(...)` relation.
 * `asset_rental_sessions` has TWO foreign keys to `assets` (`asset_id → assets.id` AND
 * `assets.active_rental_session_id → asset_rental_sessions.id`), so PostgREST cannot disambiguate the embed and
 * returns error PGRST201. The page discarded that error and treated `data = null` as `notFound()`, so EVERY
 * session 404'd. The fix is to (1) never begin with an embedded relationship, (2) prove the session row exists
 * first, (3) load related records separately, and (4) surface real query errors instead of swallowing them.
 *
 * This module owns only the DATA loading (session → asset → submissions). It is injectable via
 * `EvidenceQueryClient` so it can be unit-tested with fixtures (no live PostgREST chain). Storage signing +
 * rendering stay in the page. RLS on the underlying tables is what enforces org isolation — a cross-org session
 * simply returns no row (→ `notFound()` in the page), never another org's data.
 */

export type SessionRow = {
  id: string;
  asset_id: string | null;
  organization_id: string;
  status: string;
  rental_reference: string | null;
  renter_label: string | null;
  started_at: string;
  returned_at: string | null;
};

export type AssetRow = { asset_code: string; asset_name: string };

export type SubRow = {
  id: string;
  created_at: string;
  form_type: string;
  submission_origin: string | null;
  status: string;
  submitted_by_name: string | null;
  submission_data_json: unknown;
  media_urls: unknown;
};

/** Minimal result shape shared by the RLS supabase client and the test fakes. */
type QueryResult<T> = { data: T | null; error: { message: string } | null };

/**
 * The three reads the loader performs, abstracted so tests can inject fixtures. Each returns the PostgREST-style
 * `{ data, error }` so a real query error is observable (and re-thrown), never coerced to a null → 404.
 */
export interface EvidenceQueryClient {
  loadSession(sessionId: string): Promise<QueryResult<SessionRow>>;
  loadAsset(assetId: string): Promise<QueryResult<AssetRow>>;
  loadSubmissions(sessionId: string): Promise<QueryResult<SubRow[]>>;
}

export type RentalSessionEvidence = {
  session: SessionRow;
  asset: AssetRow | null;
  submissions: SubRow[];
};

/**
 * Load a rental session and its evidence records.
 *
 * Returns `null` ONLY when no accessible session row exists (missing id, or hidden cross-org by RLS) — the page
 * turns that into `notFound()`. THROWS on any unexpected query error (logged with a scoped prefix) so the real
 * database cause surfaces in server logs and the generic error page, instead of masquerading as a 404. A session
 * that exists but is missing its asset / outbound / renter / staff records resolves normally to empty related
 * data (the page renders per-source empty states) — never a 404.
 */
export async function getRentalSessionEvidence(
  client: EvidenceQueryClient,
  sessionId: string
): Promise<RentalSessionEvidence | null> {
  const sessionResult = await client.loadSession(sessionId);
  if (sessionResult.error) {
    console.error("[session-evidence] session load failed", sessionResult.error);
    throw new Error(`session-evidence: failed to load session (${sessionResult.error.message})`);
  }
  const session = sessionResult.data;
  if (!session) return null; // genuine missing / cross-org-hidden by RLS → notFound() in the page

  let asset: AssetRow | null = null;
  if (session.asset_id) {
    const assetResult = await client.loadAsset(session.asset_id);
    if (assetResult.error) {
      console.error("[session-evidence] asset load failed", assetResult.error);
      throw new Error(`session-evidence: failed to load asset (${assetResult.error.message})`);
    }
    asset = assetResult.data ?? null; // a missing asset is an empty state, not a 404
  }

  const subsResult = await client.loadSubmissions(sessionId);
  if (subsResult.error) {
    console.error("[session-evidence] submissions load failed", subsResult.error);
    throw new Error(`session-evidence: failed to load submissions (${subsResult.error.message})`);
  }

  return { session, asset, submissions: subsResult.data ?? [] };
}

// Type-only import (erased at runtime) so this module stays safe to import from the node test env.
import type { createClient } from "@/lib/supabase/server";
type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Adapter that builds an {@link EvidenceQueryClient} over the RLS-scoped supabase server client. Every read is
 * org-scoped by row-level security; no service role. The session query intentionally selects NO embedded relation
 * (that ambiguous embed was the 404 root cause).
 */
export function createEvidenceQueryClient(supabase: ServerClient): EvidenceQueryClient {
  return {
    loadSession: async (sessionId) =>
      (await supabase
        .from("asset_rental_sessions")
        .select(
          "id, asset_id, organization_id, status, rental_reference, renter_label, started_at, returned_at"
        )
        .eq("id", sessionId)
        .maybeSingle()) as unknown as QueryResult<SessionRow>,
    loadAsset: async (assetId) =>
      (await supabase
        .from("assets")
        .select("asset_code, asset_name")
        .eq("id", assetId)
        .maybeSingle()) as unknown as QueryResult<AssetRow>,
    loadSubmissions: async (sessionId) =>
      (await supabase
        .from("form_submissions")
        .select(
          "id, created_at, form_type, submission_origin, status, submitted_by_name, submission_data_json, media_urls"
        )
        .eq("rental_session_id", sessionId)
        .order("created_at", { ascending: true })) as unknown as QueryResult<SubRow[]>,
  };
}
