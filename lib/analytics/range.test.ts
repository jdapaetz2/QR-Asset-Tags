import { describe, expect, it } from "vitest";

import {
  parseRange,
  rangeCutoffMs,
  rangeLabel,
  rangePeriodWord,
  rangeStamp,
  withinRange,
} from "./range";

describe("parseRange", () => {
  it("accepts 7/30/90 and falls back to 7", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("30")).toBe(30);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("14")).toBe(7);
    expect(parseRange(undefined)).toBe(7);
    expect(parseRange("abc")).toBe(7);
  });
});

describe("rangeCutoffMs + withinRange", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-07-10T15:00:00Z");

  it("cuts off at the start of the oldest UTC day in the window", () => {
    const cutoff = rangeCutoffMs(now, 7);
    // 7-day window ending today (Jul 10) → oldest day is Jul 4 00:00 UTC.
    expect(new Date(cutoff).toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  it("keeps rows within range and drops older/invalid ones", () => {
    const cutoff = rangeCutoffMs(now, 7);
    const rows = [
      { at: new Date(now).toISOString() }, // today
      { at: new Date(now - 6 * day).toISOString() }, // 6 days ago (in)
      { at: new Date(now - 20 * day).toISOString() }, // out
      { at: "not-a-date" }, // dropped
    ];
    expect(withinRange(rows, (r) => r.at, cutoff)).toHaveLength(2);
  });
});

describe("labels + stamp", () => {
  it("rangeLabel / rangePeriodWord", () => {
    expect(rangeLabel(7)).toBe("7d");
    expect(rangeLabel(30)).toBe("30d");
    expect(rangePeriodWord(7)).toBe("this week");
    expect(rangePeriodWord(30)).toBe("in the last 30 days");
    expect(rangePeriodWord(90)).toBe("in the last 90 days");
  });

  it("rangeStamp reads as MON D – MON D · YYYY", () => {
    // Use a UTC-noon date so local rendering stays on the same calendar day.
    const now = new Date("2026-07-10T12:00:00Z");
    expect(rangeStamp(now, 7)).toMatch(/^[A-Z]{3} \d+ – [A-Z]{3} \d+ · 2026$/);
  });
});
