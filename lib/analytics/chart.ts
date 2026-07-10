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
