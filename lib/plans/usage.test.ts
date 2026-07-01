import { describe, expect, it } from "vitest";

import {
  COVERED_ASSET_DEFINITION,
  PLAN_CONTACT_COPY,
  SCANS_UNLIMITED_COPY,
  coverageLimitLabel,
  coveragePercent,
  coverageTone,
} from "./usage";

describe("coveragePercent", () => {
  it("computes a rounded percent against a numeric limit", () => {
    expect(coveragePercent(7, 100)).toBe(7);
    expect(coveragePercent(50, 100)).toBe(50);
    expect(coveragePercent(1, 3)).toBe(33);
    expect(coveragePercent(101, 100)).toBe(101);
  });

  it("returns null for a null or non-positive limit", () => {
    expect(coveragePercent(7, null)).toBeNull();
    expect(coveragePercent(0, 0)).toBeNull();
    expect(coveragePercent(5, -10)).toBeNull();
  });
});

describe("coverageTone", () => {
  it("stays neutral with no limit or under 80%", () => {
    expect(coverageTone(500, null)).toBe("neutral");
    expect(coverageTone(0, 100)).toBe("neutral");
    expect(coverageTone(79, 100)).toBe("neutral");
  });

  it("warns from 80% to 99%", () => {
    expect(coverageTone(80, 100)).toBe("warning");
    expect(coverageTone(99, 100)).toBe("warning");
  });

  it("escalates to danger at or over 100%", () => {
    expect(coverageTone(100, 100)).toBe("danger");
    expect(coverageTone(120, 100)).toBe("danger");
  });
});

describe("coverageLimitLabel", () => {
  it("labels a numeric limit and a null limit safely", () => {
    expect(coverageLimitLabel(100)).toBe("100");
    expect(coverageLimitLabel(0)).toBe("0");
    expect(coverageLimitLabel(null)).toBe("No limit");
  });
});

describe("usage copy", () => {
  it("states scans are unlimited and defines covered assets", () => {
    expect(SCANS_UNLIMITED_COPY).toMatch(/scans are unlimited/i);
    expect(COVERED_ASSET_DEFINITION).toMatch(/non-archived/i);
    expect(COVERED_ASSET_DEFINITION).toMatch(/coverage/i);
    expect(PLAN_CONTACT_COPY).toMatch(/contact assettag qr/i);
  });
});
