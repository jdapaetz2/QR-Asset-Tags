/**
 * Single source of truth for the authenticated rental-session evidence view URL (Phase 3B; canonical name
 * Phase 3C.3). The staff completion page, submission detail, asset detail, and asset timeline all link here.
 * The route parameter is ALWAYS a `rental_session_id` — never an asset/submission/qr/inspection id.
 */
export function buildSessionEvidenceHref(sessionId: string | null | undefined): string {
  // Guard a falsy id so we never mint /dashboard/rentals/undefined. A bare /dashboard/rentals resolves to a
  // safe index redirect (app/(admin)/dashboard/rentals/page.tsx), so this can never 404.
  return sessionId ? `/dashboard/rentals/${sessionId}` : "/dashboard/rentals";
}

/** @deprecated Phase 3C.3 — use `buildSessionEvidenceHref`. Kept as a thin alias for back-compat. */
export const rentalEvidenceHref = buildSessionEvidenceHref;

/**
 * Loose UUID shape check (Phase 3C.4). The session-evidence loader uses this to reject a malformed
 * `[sessionId]` param up front — so an obviously invalid id `notFound()`s deterministically instead of
 * reaching the database, and a real DB error is never mistaken for "bad id". Accepts the canonical 8-4-4-4-12
 * hex form (any version/variant nibble); case-insensitive.
 */
export function isLikelyUuid(id: string | null | undefined): boolean {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
