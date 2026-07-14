/**
 * Single source of truth for the authenticated rental-session evidence view URL (Phase 3B). Keeping the
 * path in one pure helper means the staff completion page, submission detail, asset detail, and asset
 * timeline all link to the same place.
 */
export function rentalEvidenceHref(sessionId: string | null | undefined): string {
  // Guard a falsy id so we never mint /dashboard/rentals/undefined (which would 404). Callers gate on a
  // real session id; this is defense-in-depth for the completion/detail/timeline links.
  return sessionId ? `/dashboard/rentals/${sessionId}` : "/dashboard/rentals";
}
