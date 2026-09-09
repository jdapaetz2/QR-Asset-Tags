import {
  backoffMs,
  hasChanged,
  shouldKeepPolling,
  type FreshnessToken,
} from "@/lib/ui/freshness";

/**
 * The submissions freshness poll loop, with every dependency injected (Phase C7).
 *
 * WHY IT IS NOT SIMPLY INSIDE THE COMPONENT. The properties that matter here are behavioural — a hidden
 * tab makes **zero** requests, a visibility toggle never creates a second timer, an unchanged token
 * triggers **nothing**, repeated failures back off and eventually stop, and a late response after
 * teardown touches nothing. This project has no jsdom or testing-library, and the local habit for
 * component tests is asserting on source text, which cannot demonstrate any of that: a `grep` for
 * `document.hidden` proves the string exists, not that the timer stopped.
 *
 * So the loop lives here, driven by injected timer and fetch functions, and its tests exercise the real
 * control flow. The React component becomes a thin adapter that supplies `setInterval`, `fetch` and the
 * document's visibility.
 */

export type TimerHandle = number | object;

export type FreshnessPollerDeps = {
  /** Fetch and parse the token. Rejecting (or resolving null) counts as a failure. */
  fetchToken: () => Promise<FreshnessToken | null>;
  /** The token the current render is showing — what a fetched token is compared against. */
  getBaseline: () => FreshnessToken | null;
  /** Called ONLY when the token has actually moved. */
  onChanged: (token: FreshnessToken) => void;
  /** Whether the tab is currently hidden. */
  isHidden: () => boolean;
  intervalMs: number;
  setTimer: (fn: () => void, ms: number) => TimerHandle;
  clearTimer: (handle: TimerHandle) => void;
};

export type FreshnessPoller = {
  /** Begin polling if the tab is visible. Safe to call repeatedly — never creates a second timer. */
  start(): void;
  /** React to a visibility change: start when visible, stop when hidden. */
  syncVisibility(): void;
  /** Run one poll immediately (used by the tests to drive a tick deterministically). */
  tick(): Promise<void>;
  /** Tear down: clears the timer and makes any in-flight response a no-op. */
  dispose(): void;
  /** Diagnostics for the tests: how many timers are currently live (must never exceed 1). */
  activeTimers(): number;
  /** Diagnostics: consecutive failures so far. */
  failures(): number;
};

export function createFreshnessPoller(deps: FreshnessPollerDeps): FreshnessPoller {
  let handle: TimerHandle | null = null;
  let failures = 0;
  let disposed = false;
  let inFlight = false;

  const stop = () => {
    if (handle !== null) {
      deps.clearTimer(handle);
      handle = null;
    }
  };

  const schedule = (ms: number) => {
    // The single-timer guard. A visibility toggle storm must not accumulate intervals.
    if (handle !== null || disposed || !shouldKeepPolling(failures)) return;
    handle = deps.setTimer(() => void tick(), ms);
  };

  const tick = async (): Promise<void> => {
    // Never overlap: a network slower than the interval must not queue up requests.
    if (disposed || inFlight) return;
    inFlight = true;
    try {
      const token = await deps.fetchToken();
      if (disposed) return;
      if (!token) throw new Error("no token");
      failures = 0;
      // The heart of C7: an unchanged token does nothing whatsoever.
      if (hasChanged(deps.getBaseline(), token)) deps.onChanged(token);
    } catch {
      if (disposed) return;
      failures++;
      stop();
      // Back off, and after the ceiling stop entirely rather than retrying a broken endpoint forever.
      if (shouldKeepPolling(failures)) schedule(backoffMs(failures));
    } finally {
      inFlight = false;
    }
  };

  return {
    start() {
      if (disposed || deps.isHidden()) return;
      schedule(deps.intervalMs);
    },
    syncVisibility() {
      if (disposed) return;
      if (deps.isHidden()) stop();
      else schedule(deps.intervalMs);
    },
    tick,
    dispose() {
      disposed = true;
      stop();
    },
    activeTimers() {
      return handle === null ? 0 : 1;
    },
    failures() {
      return failures;
    },
  };
}
