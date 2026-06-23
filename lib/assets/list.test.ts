import { describe, expect, it } from "vitest";

import {
  assetPageStatus,
  deleteEligibility,
  matchesPageFilter,
  matchesQrFilter,
  parseAssetListParams,
  sanitizeSearch,
} from "./list";

describe("parseAssetListParams", () => {
  it("defaults to active lifecycle, asset_code sort, and 'all' filters", () => {
    expect(parseAssetListParams({})).toEqual({
      q: "",
      publicStatus: "all",
      category: "",
      qr: "all",
      page: "all",
      lifecycle: "active",
      sort: "asset_code",
    });
  });

  it("accepts valid values and rejects invalid ones to defaults", () => {
    const p = parseAssetListParams({
      q: "  excavator ",
      status: "private",
      qr: "missing",
      page: "published",
      lifecycle: "archived",
      sort: "created_at",
    });
    expect(p).toMatchObject({
      q: "excavator",
      publicStatus: "private",
      qr: "missing",
      page: "published",
      lifecycle: "archived",
      sort: "created_at",
    });
    expect(
      parseAssetListParams({ status: "bogus", sort: "drop", lifecycle: "x" })
    ).toMatchObject({ publicStatus: "all", sort: "asset_code", lifecycle: "active" });
  });

  it("takes the first value of array params", () => {
    expect(parseAssetListParams({ q: ["a", "b"] }).q).toBe("a");
  });
});

describe("sanitizeSearch", () => {
  it("removes PostgREST or-breaking characters", () => {
    const out = sanitizeSearch("a,b(c)*%\\d");
    for (const ch of [",", "(", ")", "*", "%", "\\"]) {
      expect(out).not.toContain(ch);
    }
    expect(out).toContain("a");
    expect(out).toContain("d");
  });
  it("leaves a safe query untouched", () => {
    expect(sanitizeSearch("EXCAVATOR-017")).toBe("EXCAVATOR-017");
  });
});

describe("assetPageStatus", () => {
  it("maps presence + published flag", () => {
    expect(assetPageStatus(false, false)).toBe("missing");
    expect(assetPageStatus(true, false)).toBe("draft");
    expect(assetPageStatus(true, true)).toBe("published");
  });
});

describe("matchers", () => {
  it("qr filter", () => {
    expect(matchesQrFilter("all", false)).toBe(true);
    expect(matchesQrFilter("has", true)).toBe(true);
    expect(matchesQrFilter("has", false)).toBe(false);
    expect(matchesQrFilter("missing", false)).toBe(true);
  });
  it("page filter", () => {
    expect(matchesPageFilter("all", "missing")).toBe(true);
    expect(matchesPageFilter("draft", "draft")).toBe(true);
    expect(matchesPageFilter("published", "draft")).toBe(false);
  });
});

describe("deleteEligibility", () => {
  const none = { qr: 0, scans: 0, submissions: 0, documents: 0, page: 0 };
  it("allows delete only with zero dependencies", () => {
    expect(deleteEligibility(none).canDelete).toBe(true);
    expect(deleteEligibility({ ...none, qr: 1 }).canDelete).toBe(false);
    expect(deleteEligibility({ ...none, scans: 3 }).reason).toMatch(/archive/i);
    expect(deleteEligibility({ ...none, submissions: 2, documents: 1 }).reason).toMatch(
      /submissions/i
    );
  });
});
