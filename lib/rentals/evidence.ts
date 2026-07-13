/**
 * Single source of truth for the authenticated rental-session evidence view URL (Phase 3B). Keeping the
 * path in one pure helper means the staff completion page, submission detail, asset detail, and asset
 * timeline all link to the same place.
 */
export function rentalEvidenceHref(sessionId: string): string {
  return `/dashboard/rentals/${sessionId}`;
}
