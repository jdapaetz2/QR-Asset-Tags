import { describe, expect, it } from "vitest";

import { buildPublicQrUrl } from "./url";

describe("buildPublicQrUrl", () => {
  it("joins base and short_code at /t/", () => {
    expect(buildPublicQrUrl("https://example.com", "demo-ex017")).toBe(
      "https://example.com/t/demo-ex017"
    );
  });

  it("strips trailing slashes from the base", () => {
    expect(buildPublicQrUrl("https://example.com/", "abc")).toBe(
      "https://example.com/t/abc"
    );
    expect(buildPublicQrUrl("http://localhost:3000//", "abc")).toBe(
      "http://localhost:3000/t/abc"
    );
  });

  /**
   * Phase B3 — path preservation on the canonical host.
   *
   * A permanent tag encodes this exact string. Any change to the shape (an extra segment, a query
   * string, a rewritten code) breaks every tag already in the field, so it is pinned here rather than
   * left as an implicit property of a template literal.
   */
  describe("the canonical Mulemark host", () => {
    it("produces exactly https://mulemark.io/t/<shortCode>", () => {
      expect(buildPublicQrUrl("https://mulemark.io", "demo-ex017")).toBe(
        "https://mulemark.io/t/demo-ex017"
      );
    });

    it("preserves hyphenated and alias-style short codes verbatim", () => {
      // An original code and its replacement alias must each encode their OWN code — rotation never
      // rewrites a printed tag's target.
      expect(buildPublicQrUrl("https://mulemark.io", "excavator-17")).toBe(
        "https://mulemark.io/t/excavator-17"
      );
      expect(buildPublicQrUrl("https://mulemark.io", "67uqc3q7")).toBe(
        "https://mulemark.io/t/67uqc3q7"
      );
    });

    it("adds no query string, fragment, or extra path segment", () => {
      const url = buildPublicQrUrl("https://mulemark.io", "abc123");
      expect(url).not.toContain("?");
      expect(url).not.toContain("#");
      expect(new URL(url).pathname).toBe("/t/abc123");
    });
  });
});
