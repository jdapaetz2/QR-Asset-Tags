import { describe, expect, it } from "vitest";

import {
  backoffMs,
  FRESHNESS_POLL_MS,
  hasChanged,
  MAX_FRESHNESS_FAILURES,
  newSince,
  parseToken,
  shouldKeepPolling,
  type FreshnessToken,
} from "./freshness";

const token = (newCount: number, latest: string | null): FreshnessToken => ({ newCount, latest });
const T1 = "2026-09-09T10:00:00.000Z";
const T2 = "2026-09-09T10:05:00.000Z";

describe("hasChanged — the decision that stops a needless refresh", () => {
  it("is false when nothing moved (the common case, and the whole point of C7)", () => {
    expect(hasChanged(token(3, T1), token(3, T1))).toBe(false);
  });

  it("is true when the new count moves", () => {
    expect(hasChanged(token(3, T1), token(4, T1))).toBe(true);
    // Down as well as up: someone else triaging the queue is still a reason to reload.
    expect(hasChanged(token(3, T1), token(2, T1))).toBe(true);
  });

  /**
   * The case a count-only token cannot see: one submission arrives while another is resolved, so the
   * `status='new'` count is identical while a new row sits unseen in the inbox. This is why `latest`
   * exists, and this test is the reason it must not be removed as redundant.
   */
  it("is true when an arrival coincides with a resolution and the count is unchanged", () => {
    expect(hasChanged(token(3, T1), token(3, T2))).toBe(true);
  });

  it("handles an organization with no submissions at all", () => {
    expect(hasChanged(token(0, null), token(0, null))).toBe(false);
    expect(hasChanged(token(0, null), token(1, T1))).toBe(true);
  });

  it("treats a missing side as no information rather than as a change", () => {
    // A failed poll must never be reported to the admin as "something happened".
    expect(hasChanged(null, token(3, T1))).toBe(false);
    expect(hasChanged(token(3, T1), null)).toBe(false);
  });
});

describe("newSince", () => {
  it("counts arrivals since the rendered baseline", () => {
    expect(newSince(token(2, T1), token(5, T2))).toBe(3);
  });

  it("never reports a negative arrival when the queue was triaged down", () => {
    // Still a change (hasChanged says so) — just not "-2 new".
    expect(newSince(token(4, T1), token(2, T1))).toBe(0);
  });

  it("is zero without both sides", () => {
    expect(newSince(null, token(5, T1))).toBe(0);
    expect(newSince(token(5, T1), null)).toBe(0);
  });
});

describe("backoff and giving up", () => {
  it("uses the normal interval when healthy", () => {
    expect(backoffMs(0)).toBe(FRESHNESS_POLL_MS);
  });

  it("grows with consecutive failures and is capped", () => {
    const first = backoffMs(1);
    const second = backoffMs(2);
    expect(second).toBeGreaterThan(first);
    expect(backoffMs(50)).toBeLessThanOrEqual(10 * 60_000);
    // A failing endpoint is never polled faster than a healthy one.
    expect(backoffMs(1)).toBeGreaterThanOrEqual(FRESHNESS_POLL_MS);
  });

  it("stops entirely once the failure ceiling is reached", () => {
    expect(shouldKeepPolling(0)).toBe(true);
    expect(shouldKeepPolling(MAX_FRESHNESS_FAILURES - 1)).toBe(true);
    expect(shouldKeepPolling(MAX_FRESHNESS_FAILURES)).toBe(false);
  });
});

describe("parseToken — a malformed body is never mistaken for 'nothing changed'", () => {
  it("accepts the expected shape", () => {
    expect(parseToken({ newCount: 4, latest: T1 })).toEqual(token(4, T1));
    expect(parseToken({ newCount: 0, latest: null })).toEqual(token(0, null));
  });

  it("ignores extra fields rather than passing them through", () => {
    // A future endpoint that returns more must not leak it into client state.
    expect(parseToken({ newCount: 1, latest: T1, rows: [{ id: "x" }] })).toEqual(token(1, T1));
  });

  it("rejects anything that is not the contract", () => {
    for (const bad of [
      null,
      undefined,
      "nope",
      42,
      {},
      { newCount: "3", latest: T1 },
      { newCount: Number.NaN, latest: T1 },
      { newCount: 3, latest: 12345 },
      { ok: false }, // the endpoint's refusal body
    ]) {
      expect(parseToken(bad)).toBeNull();
    }
  });
});
