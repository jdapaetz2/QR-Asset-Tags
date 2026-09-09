/**
 * Pure decisions for the submissions inbox freshness poll (Phase C7).
 *
 * WHY THIS IS A SEPARATE MODULE. C0 §11 found the inbox running a full-page `router.refresh()` every
 * 30 s **whether or not anything had changed** — re-rendering the whole page server-side and re-priming
 * every row link, to discover nothing. C7 replaces that with a tiny token read and a comparison. The
 * comparison, the backoff and the interval floor live here so they can be tested directly, rather than
 * inferred from a component's behaviour under a fake timer.
 *
 * These functions do no I/O, touch no DOM and read no environment.
 */

/**
 * The smallest answer to "is the inbox stale?".
 *
 * NEITHER FIELD IS REDUNDANT, and the reason matters:
 *   - `newCount` alone misses an arrival that coincides with a resolution — the count is identical while
 *     a new row is sitting unseen;
 *   - `latest` alone misses every status change, including a row moving `new → reviewed` in another tab.
 *
 * Both values are already on screen for the same admin, so the token exposes nothing new. It carries no
 * ids, no names, no rows.
 */
export type FreshnessToken = {
  newCount: number;
  /** ISO timestamp of the newest submission, or null when the organization has none. */
  latest: string | null;
};

/** The default poll interval. Halved in frequency from C0's 30 s, and each tick is now tiny. */
export const FRESHNESS_POLL_MS = 60_000;

/** Consecutive failures tolerated before polling stops entirely rather than retrying forever. */
export const MAX_FRESHNESS_FAILURES = 4;

const BACKOFF_BASE_MS = 60_000;
const BACKOFF_CAP_MS = 10 * 60_000;

/** Whether the server state the inbox depends on has moved. Absent baseline → not a change. */
export function hasChanged(a: FreshnessToken | null, b: FreshnessToken | null): boolean {
  if (!a || !b) return false;
  return a.newCount !== b.newCount || a.latest !== b.latest;
}

/**
 * How many NEW submissions have appeared since the baseline, for the "N new" affordance.
 *
 * Clamped at zero: if the count went DOWN (someone else triaged the queue) that is a change worth
 * reloading for, but it is not "-3 new". The caller distinguishes the two with `hasChanged`.
 */
export function newSince(baseline: FreshnessToken | null, current: FreshnessToken | null): number {
  if (!baseline || !current) return 0;
  return Math.max(0, current.newCount - baseline.newCount);
}

/**
 * Delay before the next attempt after `failures` consecutive errors.
 *
 * Capped exponential. A freshness poll is a convenience, so a server having a bad minute must not be met
 * with a client that keeps asking at full rate — that is how a small outage becomes a load problem.
 */
export function backoffMs(failures: number): number {
  if (failures <= 0) return FRESHNESS_POLL_MS;
  return Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_CAP_MS);
}

/** Whether polling should continue at all. After the ceiling it stops until the page is reloaded. */
export function shouldKeepPolling(failures: number): boolean {
  return failures < MAX_FRESHNESS_FAILURES;
}

/**
 * Parse an untrusted freshness response body into a token, or null.
 *
 * Deliberately strict: a body that is not exactly the expected shape yields null, which the caller
 * treats as "no information", never as "nothing changed". Silently coercing a malformed payload into a
 * token would let a broken endpoint masquerade as a quiet one.
 */
export function parseToken(body: unknown): FreshnessToken | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.newCount !== "number" || !Number.isFinite(record.newCount)) return null;
  const latest = record.latest;
  if (latest !== null && typeof latest !== "string") return null;
  return { newCount: record.newCount, latest };
}
