import { describe, expect, it } from "vitest";

import {
  barSpec,
  chartMax,
  chartDensity,
  dataStartNote,
  MIN_BAR_PCT,
} from "./chart";

describe("chartDensity", () => {
  it("widens for 7, moderates for 30, compacts for 90 — keeping daily buckets", () => {
    expect(chartDensity(7)).toBe("gap-1.5");
    expect(chartDensity(8)).toBe("gap-1");
    expect(chartDensity(30)).toBe("gap-1");
    expect(chartDensity(31)).toBe("gap-px");
    expect(chartDensity(90)).toBe("gap-px");
  });
});

describe("dataStartNote", () => {
  const day = (date: string, count: number) => ({ date, count });

  it("names the first active day when the range has leading zero-days", () => {
    const series = [
      day("2026-07-04", 0),
      day("2026-07-05", 0),
      day("2026-07-06", 0),
      day("2026-07-07", 12),
      day("2026-07-08", 3),
    ];
    expect(dataStartNote(series)).toBe("Activity begins Jul 7.");
  });

  it("returns null when activity spans from the range start", () => {
    expect(dataStartNote([day("2026-07-04", 5), day("2026-07-05", 0)])).toBeNull();
  });

  it("returns null for an all-zero range (never implies missing/broken data)", () => {
    expect(dataStartNote([day("2026-07-04", 0), day("2026-07-05", 0)])).toBeNull();
    expect(dataStartNote([])).toBeNull();
  });

  it("handles a single sparse nonzero day mid-series", () => {
    const series = [
      day("2026-06-01", 0),
      day("2026-06-02", 0),
      day("2026-06-03", 1),
      day("2026-06-04", 0),
    ];
    expect(dataStartNote(series)).toBe("Activity begins Jun 3.");
  });
});

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
