/**
 * Covered-asset math. Pure — the page/action fetches RLS-scoped rows and passes them
 * here. Covered asset = a non-archived asset with >= 1 qr_links row. Disabled links
 * still count (disabling a tag must not reduce the plan count); archived assets and
 * assets with no link never count; scan/rental activity is irrelevant.
 */

/** Count non-archived assets that have at least one QR link (by asset id). */
export function countCoveredAssets(
  nonArchivedAssetIds: string[],
  qrLinkAssetIds: string[]
): number {
  const linked = new Set(qrLinkAssetIds);
  let n = 0;
  for (const id of nonArchivedAssetIds) {
    if (linked.has(id)) n += 1;
  }
  return n;
}

/** Owner view: covered count per organization. */
export function coveredCountByOrg(
  assets: { id: string; organization_id: string; archived_at: string | null }[],
  qrLinks: { asset_id: string; organization_id: string }[]
): Map<string, number> {
  const linked = new Set(qrLinks.map((q) => q.asset_id));
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (a.archived_at !== null) continue;
    if (!linked.has(a.id)) continue;
    counts.set(a.organization_id, (counts.get(a.organization_id) ?? 0) + 1);
  }
  return counts;
}

/** A null limit means unlimited/custom/unset — never "over". */
export function isOverCoverage(covered: number, limit: number | null): boolean {
  return limit !== null && covered >= limit;
}

/** Remaining coverage, or null when there is no limit. */
export function remainingCoverage(
  covered: number,
  limit: number | null
): number | null {
  return limit === null ? null : Math.max(0, limit - covered);
}
