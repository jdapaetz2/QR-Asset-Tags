/**
 * Pure display helpers for covered-asset usage. No I/O and no enforcement — the
 * covered count and limit come from the existing coverage helpers; these only decide
 * how usage is presented (percent, tone, labels, copy). A null limit means
 * custom/unlimited and is never treated as "over".
 */

export type CoverageTone = "neutral" | "warning" | "danger";

/** Usage as a whole percent, or null when there is no numeric limit. */
export function coveragePercent(
  covered: number,
  limit: number | null
): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.round((covered / limit) * 100);
}

/**
 * Visual tone for a usage level. No limit → neutral (never alarming); under 80% →
 * neutral; 80–99% → warning; at/over 100% → danger. Display only; nothing is blocked
 * here (enforcement lives server-side).
 */
export function coverageTone(covered: number, limit: number | null): CoverageTone {
  const pct = coveragePercent(covered, limit);
  if (pct === null) return "neutral";
  if (pct >= 100) return "danger";
  if (pct >= 80) return "warning";
  return "neutral";
}

/** Human label for the limit: a number, or "No limit" when unset/custom. */
export function coverageLimitLabel(limit: number | null): string {
  return limit === null ? "No limit" : String(limit);
}

export const SCANS_UNLIMITED_COPY = "Scans are unlimited.";

export const COVERED_ASSET_DEFINITION =
  "Covered assets are active, non-archived assets with AssetTag QR coverage assigned.";

export const PLAN_CONTACT_COPY =
  "Contact AssetTag QR to change your plan or covered asset limit.";
