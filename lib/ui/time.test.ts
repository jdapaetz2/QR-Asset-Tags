import { describe, expect, it } from "vitest";

import { formatAbsolute, formatRelative } from "./time";

// Fixed reference "now": 2026-07-09T18:00:00Z.
const NOW = Date.UTC(2026, 6, 9, 18, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelative", () => {
  it("just now under 45s", () => {
    expect(formatRelative(ago(5 * SEC), NOW)).toBe("just now");
    expect(formatRelative(ago(44 * SEC), NOW)).toBe("just now");
  });

  it("minutes / hours / days ago", () => {
    expect(formatRelative(ago(5 * MIN), NOW)).toBe("5 min ago");
    expect(formatRelative(ago(2 * HOUR), NOW)).toBe("2h ago");
    expect(formatRelative(ago(7 * DAY), NOW)).toBe("7d ago");
  });

  it("future times read as 'in …'", () => {
    expect(formatRelative(new Date(NOW + 3 * HOUR).toISOString(), NOW)).toBe("in 3h");
  });

  it("falls back to an absolute date beyond ~30 days", () => {
    const out = formatRelative(ago(60 * DAY), NOW);
    expect(out).not.toMatch(/ago/);
    expect(out).toMatch(/2026/);
  });

  it("invalid / missing → placeholder", () => {
    expect(formatRelative(null, NOW)).toBe("—");
    expect(formatRelative(undefined, NOW)).toBe("—");
    expect(formatRelative("not-a-date", NOW)).toBe("—");
  });
});

describe("formatAbsolute", () => {
  it("formats date + time deterministically with a fixed timeZone", () => {
    const out = formatAbsolute("2026-07-09T18:00:00Z", { timeZone: "UTC", withTime: true });
    expect(out).toMatch(/Jul 9, 2026/);
    expect(out).toMatch(/6:00\s?PM/i);
  });

  it("date-only when requested", () => {
    const out = formatAbsolute("2026-07-09T18:00:00Z", {
      timeZone: "UTC",
      dateStyle: "medium",
    });
    expect(out).toMatch(/Jul 9, 2026/);
    expect(out).not.toMatch(/PM|AM/i);
  });

  it("invalid / missing → placeholder", () => {
    expect(formatAbsolute(null)).toBe("—");
    expect(formatAbsolute("nope")).toBe("—");
  });
});
