/**
 * Pure helpers for the shared auto-refresh control (RefreshControls). Kept out of the client
 * component so the interval floor and the hidden-tab decision are testable, and so a caller can
 * never accidentally configure a too-fast poll (a duplicate/tight-loop guard — see stability wave).
 */

/** The floor for any automatic poll. Nothing polls faster than this. */
export const MIN_POLL_INTERVAL_MS = 30_000;

/**
 * Normalize a requested poll interval:
 *   - `undefined` / non-finite / ≤ 0  → `undefined` (no polling at all)
 *   - anything faster than the floor  → clamped up to `MIN_POLL_INTERVAL_MS`
 * So a component wired with a stray small value degrades to the 30s floor rather than a tight loop.
 */
export function normalizePollMs(pollMs: number | undefined): number | undefined {
  if (pollMs == null || !Number.isFinite(pollMs) || pollMs <= 0) return undefined;
  return Math.max(pollMs, MIN_POLL_INTERVAL_MS);
}

/** Whether polling should run right now, given tab visibility. Polling pauses while hidden. */
export function shouldPoll(hidden: boolean): boolean {
  return !hidden;
}
