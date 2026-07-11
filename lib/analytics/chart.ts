/**
 * Pure normalization for the daily bar chart (docs/brand/ui-language.md chart
 * grammar). Kept separate from the component so the rules are unit-tested rather
 * than screenshot-tested.
 *
 * Rules the spec requires and this encodes:
 *  - zero-count days render as a 2px stub, never an empty gap;
 *  - the **current period is always marked in brass** — even when its count is 0
 *    (a brass stub), so the single brass bar never disappears;
 *  - low non-zero days stay visible (a 6% floor) above stub height;
 *  - all-zero ranges don't divide by zero (max is floored at 1).
 */

export type BarKind = "brass" | "bone" | "brass-stub" | "iron-stub";
export type BarSpec = { kind: BarKind; heightPct: number };

/** Minimum height (%) for a non-zero bar so small values stay visible. */
export const MIN_BAR_PCT = 6;

/**
 * Chart normalization max — the tallest daily bucket, never the period total, so bars
 * are sized relative to the busiest day. Floored at 1 so an all-zero range never divides
 * by zero (every bar is then a stub).
 */
export function chartMax(series: { count: number }[]): number {
  return Math.max(1, ...series.map((d) => d.count));
}

/**
 * Inter-bar gap class, tightened as the bucket count grows so 90 daily bars stay readable
 * (a fixed 6px gap × 89 gaps would swallow the row and crush the bars to invisible slivers).
 * Daily buckets are always kept — this only changes spacing, never rolls up. Literal Tailwind
 * classes so the v4 scanner keeps them.
 */
export function chartDensity(bars: number): string {
  if (bars <= 7) return "gap-1.5"; // wide (7-day)
  if (bars <= 30) return "gap-1"; // moderate (30-day)
  return "gap-px"; // compact (90-day)
}

const MONTHS_TITLE = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Quiet note for when the selected range starts before any real activity (leading zero-days),
 * e.g. "Activity begins Jul 7." Returns null when activity spans the whole range (first bucket
 * is already non-zero) or when the range has no activity at all — so it never implies the data
 * is missing or broken. Dates are parsed from the "YYYY-MM-DD" local-day string (no Date, no tz
 * shift). Sentence case + trailing period per the product voice.
 */
export function dataStartNote(
  series: { date: string; count: number }[]
): string | null {
  const idx = series.findIndex((d) => d.count > 0);
  if (idx <= 0) return null; // all-zero (-1) or active from the range start (0)
  const [, m, d] = series[idx].date.split("-").map(Number);
  return `Activity begins ${MONTHS_TITLE[(m ?? 1) - 1]} ${d ?? ""}.`;
}

export function barSpec(
  count: number,
  max: number,
  isCurrent: boolean
): BarSpec {
  const safeMax = Math.max(1, max);
  if (count <= 0) {
    // 2px stub (height handled by the component); brass marks the current period.
    return { kind: isCurrent ? "brass-stub" : "iron-stub", heightPct: 0 };
  }
  const heightPct = Math.max(MIN_BAR_PCT, Math.round((count / safeMax) * 100));
  return { kind: isCurrent ? "brass" : "bone", heightPct };
}
