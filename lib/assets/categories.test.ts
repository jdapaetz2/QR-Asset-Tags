import { describe, expect, it } from "vitest";

import {
  dedupeCategories,
  detectNewCategories,
  normalizeCategoryKey,
  requiresCategoryConfirmation,
} from "./categories";

describe("normalizeCategoryKey", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeCategoryKey("  Mini   Excavator ")).toBe("mini excavator");
    expect(normalizeCategoryKey("Mini Excavator")).toBe("mini excavator");
  });
});

describe("dedupeCategories", () => {
  it("drops blanks, collapses casing/space near-dups, and sorts", () => {
    expect(
      dedupeCategories([
        "Utility Trailer",
        "mini excavator",
        "Mini Excavator",
        "",
        null,
        "  ",
        undefined,
      ])
    ).toEqual(["mini excavator", "Utility Trailer"]);
  });

  it("keeps the first spelling for a normalized key", () => {
    expect(dedupeCategories(["Mini Excavator", "MINI EXCAVATOR"])).toEqual([
      "Mini Excavator",
    ]);
  });
});

describe("detectNewCategories", () => {
  it("returns only categories not already present (by normalized key)", () => {
    const existing = ["Mini Excavator", "Utility Trailer"];
    expect(
      detectNewCategories(
        ["mini excavator", "Electrical Test Equipment", "Plate Compactor"],
        existing
      )
    ).toEqual(["Electrical Test Equipment", "Plate Compactor"]);
  });

  it("collapses near-duplicate new categories and ignores blanks", () => {
    expect(
      detectNewCategories(["Skid Steer", "skid steer", "", null], [])
    ).toEqual(["Skid Steer"]);
  });

  it("returns nothing when all categories already exist", () => {
    expect(detectNewCategories(["Mini Excavator"], ["mini excavator"])).toEqual([]);
  });
});

describe("requiresCategoryConfirmation", () => {
  it("blocks when there are new categories and no confirmation", () => {
    expect(requiresCategoryConfirmation(["Material Handling"], false)).toBe(true);
  });
  it("allows once confirmed", () => {
    expect(requiresCategoryConfirmation(["Material Handling"], true)).toBe(false);
  });
  it("allows when there are no new categories", () => {
    expect(requiresCategoryConfirmation([], false)).toBe(false);
  });
});
