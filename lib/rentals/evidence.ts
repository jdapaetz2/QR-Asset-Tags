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
