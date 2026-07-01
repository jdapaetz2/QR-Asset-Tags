import { describe, expect, it } from "vitest";

import { isValidSlug, slugify, MAX_SLUG_LENGTH } from "./slug";

describe("slugify", () => {
  it("lowercases, hyphenates words, and strips punctuation", () => {
    expect(slugify("Test Valley Rentals")).toBe("test-valley-rentals");
    expect(slugify("Test Valley Rentals!")).toBe("test-valley-rentals");
    expect(slugify("  Northridge   Equipment  ")).toBe("northridge-equipment");
  });

  it("collapses runs and trims leading/trailing hyphens", () => {
    expect(slugify("A & B / C")).toBe("a-b-c");
    expect(slugify("--weird__name--")).toBe("weird-name");
  });

  it("keeps base letters from accented characters", () => {
    expect(slugify("Café Bar")).toBe("cafe-bar");
  });

  it("caps length and never ends on a hyphen", () => {
    const long = slugify("x".repeat(60));
    expect(long.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    const spaced = slugify("word ".repeat(20));
    expect(spaced.endsWith("-")).toBe(false);
  });

  it("produces empty string for all-symbol input", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase alphanumerics joined by single hyphens", () => {
    expect(isValidSlug("test-valley-rentals")).toBe(true);
    expect(isValidSlug("acme")).toBe(true);
    expect(isValidSlug("yard-2")).toBe(true);
  });

  it("rejects empties, uppercase, spaces, and bad hyphenation", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("Test")).toBe(false);
    expect(isValidSlug("a b")).toBe(false);
    expect(isValidSlug("-lead")).toBe(false);
    expect(isValidSlug("trail-")).toBe(false);
    expect(isValidSlug("double--hyphen")).toBe(false);
    expect(isValidSlug("under_score")).toBe(false);
    expect(isValidSlug("a".repeat(MAX_SLUG_LENGTH + 1))).toBe(false);
  });
});
