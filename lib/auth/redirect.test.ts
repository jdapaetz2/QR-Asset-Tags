import { describe, expect, it } from "vitest";

import { sanitizeNextPath } from "./redirect";

describe("sanitizeNextPath", () => {
  it("accepts internal paths", () => {
    expect(sanitizeNextPath("/dashboard")).toBe("/dashboard");
    expect(sanitizeNextPath("/owner")).toBe("/owner");
    expect(sanitizeNextPath("/dashboard/assets?x=1")).toBe(
      "/dashboard/assets?x=1"
    );
  });

  it("rejects open-redirect and non-path values", () => {
    expect(sanitizeNextPath("//evil.com")).toBeNull();
    expect(sanitizeNextPath("/\\evil.com")).toBeNull();
    expect(sanitizeNextPath("https://evil.com")).toBeNull();
    expect(sanitizeNextPath("dashboard")).toBeNull();
    expect(sanitizeNextPath("")).toBeNull();
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath(undefined)).toBeNull();
    expect(sanitizeNextPath(42)).toBeNull();
  });
});
