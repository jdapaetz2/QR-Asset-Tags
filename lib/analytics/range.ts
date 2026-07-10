/**
 * Analytics date-range helpers (RangeControl 7/30/90). Pure + tested; the page
 * reads `?range=` and windows the already-fetched rows in memory — no new query,
 * no schema. A "range" is the last N UTC days ending today (today inclusive), which
 * matches `dailyCounts(..., N)`'s bucketing so chart totals and the headline agree.
 */

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

const DAY_MS = 86_400_000;

/** Validate a `range` query param; anything unknown/missing falls back to 7. */
export function parseRange(value: unknown): Range {
  const n = typeof value === "string" ? Number(value) : value;
  return (RANGES as readonly number[]).includes(n as number)
    ? (n as Range)
    : 7;
}

/**
 * Inclusive cutoff (ms): a row is in range when its timestamp >= cutoff. Aligned to
 * the start of the oldest UTC day in the window so it matches `dailyCounts`.
 */
export function rangeCutoffMs(nowMs: number, range: Range): number {
  const todayStart = nowMs - (nowMs % DAY_MS);
  return todayStart - (range - 1) * DAY_MS;
}

/** Keep only rows whose `at(row)` timestamp falls within the range (invalid → dropped). */
export function withinRange<T>(
  rows: T[],
  at: (row: T) => string,
  cutoffMs: number
): T[] {
  return rows.filter((r) => {
    const t = new Date(at(r)).getTime();
    return !Number.isNaN(t) && t >= cutoffMs;
  });
}

/** Short module label, e.g. "7d" / "30d" / "90d". */
export function rangeLabel(range: Range): string {
  return `${range}d`;
}

/** Period phrase for the insight headline. Kept plain — no overfit grammar. */
export function rangePeriodWord(range: Range): string {
  return range === 7 ? "this week" : `in the last ${range} days`;
}

/** Mono band stamp, e.g. "JUL 4 – JUL 10 · 2026" (en dash, mid-dot before year). */
export function rangeStamp(now: Date, range: Range): string {
  const start = new Date(now.getTime() - (range - 1) * DAY_MS);
  const mon = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${mon(start)} ${start.getDate()} – ${mon(now)} ${now.getDate()} · ${now.getFullYear()}`;
}
