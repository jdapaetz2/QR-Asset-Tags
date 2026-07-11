import { describe, expect, it } from "vitest";

import { barSpec, chartMax, MIN_BAR_PCT } from "./chart";

describe("chartMax", () => {
  it("uses the tallest daily bucket, never the period total", () => {
    const series = [95, 3, 112, 172].map((count) => ({ count }));
    expect(chartMax(series)).toBe(172); // not 382 (the sum)
  });

  it("floors at 1 so an all-zero range never divides by zero", () => {
    expect(chartMax([{ count: 0 }, { count: 0 }])).toBe(1);
    expect(chartMax([])).toBe(1);
  });
});

describe("barSpec", () => {
  it("colors non-zero bars — brass for the current period, bone otherwise", () => {
    expect(barSpec(50, 100, true)).toEqual({ kind: "brass", heightPct: 50 });
    expect(barSpec(50, 100, false)).toEqual({ kind: "bone", heightPct: 50 });
  });

  it("keeps low non-zero values visible via the floor", () => {
    expect(barSpec(1, 1000, false).heightPct).toBe(MIN_BAR_PCT);
    expect(barSpec(1, 1000, false).kind).toBe("bone");
  });

  it("renders zero days as stubs — brass stub for the current period", () => {
    expect(barSpec(0, 100, false)).toEqual({ kind: "iron-stub", heightPct: 0 });
    // The current-period bar never disappears, even at count 0.
    expect(barSpec(0, 100, true)).toEqual({ kind: "brass-stub", heightPct: 0 });
  });

  it("does not divide by zero on an all-zero range (max floored to 1)", () => {
    // All-zero range: every bar is a stub, brass marks the current period.
    expect(barSpec(0, 0, false)).toEqual({ kind: "iron-stub", heightPct: 0 });
    expect(barSpec(0, 0, true)).toEqual({ kind: "brass-stub", heightPct: 0 });
    // A single non-zero day (its own max) normalizes to full height, no NaN.
    expect(barSpec(1, 1, true)).toEqual({ kind: "brass", heightPct: 100 });
  });
});
