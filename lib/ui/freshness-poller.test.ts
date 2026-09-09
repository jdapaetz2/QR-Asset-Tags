import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFreshnessPoller, type TimerHandle } from "./freshness-poller";
import { FRESHNESS_POLL_MS, MAX_FRESHNESS_FAILURES, type FreshnessToken } from "./freshness";

/**
 * Behavioural tests for the C7 poll loop — the acceptance checks, exercised rather than asserted.
 *
 * A fake timer registry stands in for setInterval so "how many timers are live" and "what delay was
 * requested" are directly observable. Nothing here greps source text.
 */

const T1 = "2026-09-09T10:00:00.000Z";
const T2 = "2026-09-09T10:05:00.000Z";
const token = (newCount: number, latest: string | null): FreshnessToken => ({ newCount, latest });

function harness(opts: { baseline?: FreshnessToken | null; hidden?: boolean } = {}) {
  const timers = new Map<TimerHandle, { fn: () => void; ms: number }>();
  let nextId = 1;
  let hidden = opts.hidden ?? false;

  const fetchToken = vi.fn<() => Promise<FreshnessToken | null>>();
  const onChanged = vi.fn<(t: FreshnessToken) => void>();

  const poller = createFreshnessPoller({
    fetchToken,
    getBaseline: () => opts.baseline ?? token(3, T1),
    onChanged,
    isHidden: () => hidden,
    intervalMs: FRESHNESS_POLL_MS,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (h) => {
      timers.delete(h);
    },
  });

  return {
    poller,
    fetchToken,
    onChanged,
    timers,
    setHidden: (v: boolean) => {
      hidden = v;
    },
    /** Fire every scheduled timer once, as a real clock reaching the interval would. */
    async fire() {
      for (const { fn } of [...timers.values()]) fn();
      // Let the async tick settle.
      await Promise.resolve();
      await Promise.resolve();
    },
    lastDelay: () => [...timers.values()].at(-1)?.ms ?? null,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("visibility", () => {
  it("starts one timer while visible", () => {
    const h = harness();
    h.poller.start();
    expect(h.poller.activeTimers()).toBe(1);
  });

  /** Acceptance check 1: a hidden tab makes zero polls. */
  it("starts NOTHING while hidden, and never fetches", async () => {
    const h = harness({ hidden: true });
    h.poller.start();
    expect(h.poller.activeTimers()).toBe(0);
    await h.fire();
    expect(h.fetchToken).not.toHaveBeenCalled();
  });

  it("stops when the tab becomes hidden and resumes when it returns", () => {
    const h = harness();
    h.poller.start();
    expect(h.poller.activeTimers()).toBe(1);

    h.setHidden(true);
    h.poller.syncVisibility();
    expect(h.poller.activeTimers()).toBe(0);

    h.setHidden(false);
    h.poller.syncVisibility();
    expect(h.poller.activeTimers()).toBe(1);
  });

  /** Acceptance check 8: never more than one timer, however often visibility flaps. */
  it("never accumulates timers across repeated toggles or repeated starts", () => {
    const h = harness();
    h.poller.start();
    h.poller.start();
    h.poller.start();
    for (let i = 0; i < 5; i++) {
      h.setHidden(true);
      h.poller.syncVisibility();
      h.setHidden(false);
      h.poller.syncVisibility();
    }
    expect(h.poller.activeTimers()).toBe(1);
    expect(h.timers.size).toBe(1);
  });
});

describe("what a tick does", () => {
  /** Acceptance check 3: no refresh, no notification, nothing at all when data is unchanged. */
  it("does NOTHING when the token is unchanged", async () => {
    const h = harness({ baseline: token(3, T1) });
    h.fetchToken.mockResolvedValue(token(3, T1));

    h.poller.start();
    await h.fire();

    expect(h.fetchToken).toHaveBeenCalledTimes(1);
    expect(h.onChanged).not.toHaveBeenCalled();
    // Still exactly one healthy timer; nothing was rescheduled or torn down.
    expect(h.poller.activeTimers()).toBe(1);
  });

  /** Acceptance check 4: awareness is preserved. */
  it("reports a change when a new submission arrives", async () => {
    const h = harness({ baseline: token(3, T1) });
    h.fetchToken.mockResolvedValue(token(4, T2));

    h.poller.start();
    await h.fire();

    expect(h.onChanged).toHaveBeenCalledTimes(1);
    expect(h.onChanged).toHaveBeenCalledWith(token(4, T2));
  });

  it("reports a change when only the newest timestamp moved", async () => {
    // Arrival + resolution in the same window: the count is identical, a row is still new.
    const h = harness({ baseline: token(3, T1) });
    h.fetchToken.mockResolvedValue(token(3, T2));

    h.poller.start();
    await h.fire();

    expect(h.onChanged).toHaveBeenCalledTimes(1);
  });

  it("does not overlap requests when the network is slower than the interval", async () => {
    const h = harness();
    let release: (t: FreshnessToken) => void = () => {};
    h.fetchToken.mockReturnValue(new Promise((r) => (release = r)));

    h.poller.start();
    await h.fire();
    await h.fire(); // a second interval elapses while the first is still open

    expect(h.fetchToken).toHaveBeenCalledTimes(1);
    release(token(3, T1));
  });
});

describe("failures", () => {
  it("backs off after an error instead of polling at full rate", async () => {
    const h = harness();
    h.fetchToken.mockRejectedValue(new Error("500"));

    h.poller.start();
    await h.fire();

    expect(h.poller.failures()).toBe(1);
    expect(h.poller.activeTimers()).toBe(1);
    expect(h.lastDelay()).toBeGreaterThanOrEqual(FRESHNESS_POLL_MS);
  });

  it("treats a malformed body as a failure, never as 'nothing changed'", async () => {
    const h = harness();
    h.fetchToken.mockResolvedValue(null);

    h.poller.start();
    await h.fire();

    expect(h.poller.failures()).toBe(1);
    expect(h.onChanged).not.toHaveBeenCalled();
  });

  it("gives up entirely after the ceiling rather than retrying forever", async () => {
    const h = harness();
    h.fetchToken.mockRejectedValue(new Error("500"));

    h.poller.start();
    for (let i = 0; i < MAX_FRESHNESS_FAILURES; i++) await h.fire();

    expect(h.poller.failures()).toBe(MAX_FRESHNESS_FAILURES);
    expect(h.poller.activeTimers()).toBe(0);
  });

  it("recovers to the normal cadence after a success", async () => {
    const h = harness({ baseline: token(3, T1) });
    h.fetchToken.mockRejectedValueOnce(new Error("500"));
    h.fetchToken.mockResolvedValue(token(3, T1));

    h.poller.start();
    await h.fire();
    expect(h.poller.failures()).toBe(1);

    await h.fire();
    expect(h.poller.failures()).toBe(0);
  });
});

describe("teardown", () => {
  it("clears its timer on dispose", () => {
    const h = harness();
    h.poller.start();
    h.poller.dispose();

    expect(h.poller.activeTimers()).toBe(0);
    expect(h.timers.size).toBe(0);
  });

  it("a response arriving after dispose changes nothing", async () => {
    const h = harness({ baseline: token(3, T1) });
    let release: (t: FreshnessToken) => void = () => {};
    h.fetchToken.mockReturnValue(new Promise((r) => (release = r)));

    h.poller.start();
    await h.fire();
    h.poller.dispose();
    release(token(99, T2)); // a big change, arriving too late to matter
    await Promise.resolve();
    await Promise.resolve();

    expect(h.onChanged).not.toHaveBeenCalled();
  });

  it("does not restart after dispose", () => {
    const h = harness();
    h.poller.dispose();
    h.poller.start();
    h.poller.syncVisibility();

    expect(h.poller.activeTimers()).toBe(0);
  });
});
