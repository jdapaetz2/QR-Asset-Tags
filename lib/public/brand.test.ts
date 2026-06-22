import { describe, expect, it } from "vitest";

import {
  DEFAULT_BRAND_COLOR,
  readableTextOn,
  safeBrandColor,
} from "./brand";

describe("safeBrandColor", () => {
  it("accepts a strict #RRGGBB hex", () => {
    expect(safeBrandColor("#1d4ed8")).toBe("#1d4ed8");
    expect(safeBrandColor("#AABBCC")).toBe("#AABBCC");
  });

  it("rejects shorthand, names, bad chars, and injection attempts", () => {
    expect(safeBrandColor("#fff")).toBe(DEFAULT_BRAND_COLOR);
    expect(safeBrandColor("red")).toBe(DEFAULT_BRAND_COLOR);
    expect(safeBrandColor("#12g456")).toBe(DEFAULT_BRAND_COLOR);
    expect(safeBrandColor("#1d4ed8; background: url(x)")).toBe(DEFAULT_BRAND_COLOR);
    expect(safeBrandColor('"); evil')).toBe(DEFAULT_BRAND_COLOR);
  });

  it("falls back for null/undefined/empty and honors a custom fallback", () => {
    expect(safeBrandColor(null)).toBe(DEFAULT_BRAND_COLOR);
    expect(safeBrandColor(undefined)).toBe(DEFAULT_BRAND_COLOR);
    expect(safeBrandColor("")).toBe(DEFAULT_BRAND_COLOR);
    expect(safeBrandColor("nope", "#123456")).toBe("#123456");
  });
});

describe("readableTextOn", () => {
  it("uses light text on dark brand colors and dark text on light ones", () => {
    expect(readableTextOn("#0f172a")).toBe("#ffffff");
    expect(readableTextOn("#1d4ed8")).toBe("#ffffff");
    expect(readableTextOn("#ffffff")).toBe("#0f172a");
    expect(readableTextOn("#facc15")).toBe("#0f172a"); // light yellow
  });

  it("sanitizes junk before measuring (defaults to white on dark)", () => {
    expect(readableTextOn("not-a-color")).toBe("#ffffff");
  });
});
