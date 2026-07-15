import { describe, expect, it } from "vitest";

import {
  sanitizeReturnTo,
  backHref,
  withReturnTo,
  currentListHref,
} from "./return-to";

describe("sanitizeReturnTo", () => {
  it("accepts internal dashboard paths with query strings and anchors", () => {
    expect(sanitizeReturnTo("/dashboard")).toBe("/dashboard");
    expect(sanitizeReturnTo("/dashboard/assets")).toBe("/dashboard/assets");
    expect(sanitizeReturnTo("/dashboard/assets?status=public&sort=asset_name")).toBe(
      "/dashboard/assets?status=public&sort=asset_name"
    );
    expect(sanitizeReturnTo("/dashboard/submissions?asset_id=abc#top")).toBe(
      "/dashboard/submissions?asset_id=abc#top"
    );
  });

  it("rejects external, protocol-relative, and backslash-escape URLs (open-redirect)", () => {
    expect(sanitizeReturnTo("https://evil.com")).toBeNull();
    expect(sanitizeReturnTo("//evil.com")).toBeNull();
    expect(sanitizeReturnTo("/\\evil.com")).toBeNull();
  });

  it("rejects in-app paths outside the dashboard area", () => {
    expect(sanitizeReturnTo("/owner")).toBeNull();
    expect(sanitizeReturnTo("/login")).toBeNull();
    expect(sanitizeReturnTo("/dashboardXYZ")).toBeNull(); // segment must end after /dashboard
    expect(sanitizeReturnTo("/dashboard-evil")).toBeNull();
  });

  it("rejects empty / non-string / relative values", () => {
    expect(sanitizeReturnTo("")).toBeNull();
    expect(sanitizeReturnTo("dashboard")).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo(undefined)).toBeNull();
    expect(sanitizeReturnTo(42)).toBeNull();
  });
});

describe("backHref", () => {
  it("returns the validated returnTo, else the fallback", () => {
    expect(backHref("/dashboard/assets?status=public", "/dashboard/assets")).toBe(
      "/dashboard/assets?status=public"
    );
    expect(backHref("https://evil.com", "/dashboard/assets")).toBe("/dashboard/assets");
    expect(backHref(undefined, "/dashboard/rentals")).toBe("/dashboard/rentals");
  });
});

describe("withReturnTo", () => {
  it("appends an encoded returnTo only for valid dashboard paths", () => {
    expect(withReturnTo("/dashboard/assets/1", "/dashboard/assets?status=public")).toBe(
      "/dashboard/assets/1?returnTo=%2Fdashboard%2Fassets%3Fstatus%3Dpublic"
    );
    // Uses "&" when the href already has a query string.
    expect(withReturnTo("/dashboard/rentals/1?x=1", "/dashboard/rentals")).toBe(
      "/dashboard/rentals/1?x=1&returnTo=%2Fdashboard%2Frentals"
    );
  });

  it("leaves the href untouched for invalid or absent returnTo", () => {
    expect(withReturnTo("/dashboard/assets/1", "https://evil.com")).toBe(
      "/dashboard/assets/1"
    );
    expect(withReturnTo("/dashboard/assets/1", undefined)).toBe("/dashboard/assets/1");
  });
});

describe("currentListHref", () => {
  it("rebuilds path + query from Next.js searchParams (first value per key)", () => {
    expect(
      currentListHref("/dashboard/assets", { status: "public", sort: "asset_name" })
    ).toBe("/dashboard/assets?status=public&sort=asset_name");
    expect(currentListHref("/dashboard/assets", { q: ["hilti", "extra"] })).toBe(
      "/dashboard/assets?q=hilti"
    );
    expect(currentListHref("/dashboard/assets", { q: "", status: undefined })).toBe(
      "/dashboard/assets"
    );
  });
});
