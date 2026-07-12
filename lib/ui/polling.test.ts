import { describe, expect, it } from "vitest";

import { MIN_POLL_INTERVAL_MS, normalizePollMs, shouldPoll } from "./polling";

describe("normalizePollMs", () => {
  it("returns undefined for no / invalid intervals (no polling)", () => {
    expect(normalizePollMs(undefined)).toBeUndefined();
    expect(normalizePollMs(0)).toBeUndefined();
    expect(normalizePollMs(-5)).toBeUndefined();
    expect(normalizePollMs(Number.NaN)).toBeUndefined();
    expect(normalizePollMs(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("clamps anything faster than the 30s floor up to the floor", () => {
    expect(normalizePollMs(1000)).toBe(MIN_POLL_INTERVAL_MS);
    expect(normalizePollMs(29_999)).toBe(MIN_POLL_INTERVAL_MS);
  });

  it("passes through intervals at or above the floor", () => {
    expect(normalizePollMs(30_000)).toBe(30_000);
    expect(normalizePollMs(45_000)).toBe(45_000);
  });
});

describe("shouldPoll", () => {
  it("polls only when the tab is visible", () => {
    expect(shouldPoll(false)).toBe(true); // visible
    expect(shouldPoll(true)).toBe(false); // hidden
  });
});
