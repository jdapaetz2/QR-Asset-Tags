import { describe, expect, it } from "vitest";

import {
  isTagRequestStatus,
  parseViewedFilter,
  tagRequestStatusLabel,
  unviewedCountByOrg,
  validateTagRequest,
} from "./tag-requests";

describe("isTagRequestStatus", () => {
  it("accepts the six allowed statuses and rejects others", () => {
    for (const s of [
      "requested",
      "in_review",
      "in_production",
      "ready",
      "delivered",
      "cancelled",
    ]) {
      expect(isTagRequestStatus(s)).toBe(true);
    }
    expect(isTagRequestStatus("shipped")).toBe(false);
    expect(isTagRequestStatus(null)).toBe(false);
  });
});

describe("tagRequestStatusLabel", () => {
  it("humanizes known statuses and passes through unknown", () => {
    expect(tagRequestStatusLabel("in_production")).toBe("In production");
    expect(tagRequestStatusLabel("mystery")).toBe("mystery");
  });
});

describe("parseViewedFilter", () => {
  it("accepts 'unviewed' and falls back to 'all'", () => {
    expect(parseViewedFilter("unviewed")).toBe("unviewed");
    expect(parseViewedFilter("all")).toBe("all");
    expect(parseViewedFilter("bogus")).toBe("all");
    expect(parseViewedFilter(undefined)).toBe("all");
  });
});

describe("unviewedCountByOrg", () => {
  it("counts only unviewed rows, grouped by organization", () => {
    const counts = unviewedCountByOrg([
      { organization_id: "a", platform_viewed_at: null },
      { organization_id: "a", platform_viewed_at: null },
      { organization_id: "a", platform_viewed_at: "2026-01-01T00:00:00Z" },
      { organization_id: "b", platform_viewed_at: null },
    ]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
  });

  it("treats viewed state as independent of status (unviewed still counts)", () => {
    // An in_production request that hasn't been opened is still "new" for the badge.
    const counts = unviewedCountByOrg([
      { organization_id: "a", platform_viewed_at: null },
    ]);
    expect(counts.get("a")).toBe(1);
  });

  it("returns an empty map when everything is viewed", () => {
    expect(
      unviewedCountByOrg([
        { organization_id: "a", platform_viewed_at: "2026-01-01T00:00:00Z" },
      ]).size
    ).toBe(0);
  });
});

describe("validateTagRequest", () => {
  it("accepts valid material/mounting/size from the option lists", () => {
    const result = validateTagRequest({
      material: "anodized aluminum",
      mounting_method: "adhesive",
      tag_size: "2in square",
      quantity_notes: "  two per machine ",
    });
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      material: "anodized aluminum",
      mounting_method: "adhesive",
      tag_size: "2in square",
      quantity_notes: "two per machine",
    });
  });

  it("rejects an invalid material, mounting, or size", () => {
    expect(
      validateTagRequest({
        material: "gold",
        mounting_method: "adhesive",
        tag_size: "2in square",
      }).error
    ).toMatch(/material/i);
    expect(
      validateTagRequest({
        material: "stainless",
        mounting_method: "glue",
        tag_size: "2in square",
      }).error
    ).toMatch(/mounting/i);
    expect(
      validateTagRequest({
        material: "stainless",
        mounting_method: "rivet",
        tag_size: "huge",
      }).error
    ).toMatch(/size/i);
  });

  it("maps empty quantity notes to null and never includes organization_id", () => {
    const result = validateTagRequest({
      material: "acrylic",
      mounting_method: "screw",
      tag_size: "1.5in square",
      quantity_notes: "  ",
      organization_id: "attacker",
    } as Record<string, string>);
    expect(result.value?.quantity_notes).toBeNull();
    expect(result.value).not.toHaveProperty("organization_id");
  });
});
