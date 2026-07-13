import { describe, expect, it } from "vitest";

import {
  assetsToApplyDefault,
  buildCategoryDefaultLookup,
  buildCategoryDefaultTargetLookup,
  categoryDefaultForCategory,
  categoryDefaultTargetForCategory,
  classifyReviewAssets,
  validateCategoryDefaultInput,
  type AssetForDefault,
} from "./category-defaults";

describe("buildCategoryDefaultLookup", () => {
  it("keys by the app normalization of category_value and drops unknown template keys", () => {
    const lookup = buildCategoryDefaultLookup([
      { category_value: "  Utility   Trailer ", return_template_key: "utility_trailer" },
      { category_value: "Generator", return_template_key: "portable_generator" },
      { category_value: "Spaceship", return_template_key: "not_a_key" }, // dropped
    ]);
    expect(lookup).toEqual({
      "utility trailer": "utility_trailer",
      generator: "portable_generator",
    });
  });
});

describe("categoryDefaultForCategory", () => {
  const lookup = buildCategoryDefaultLookup([
    { category_value: "Utility Trailer", return_template_key: "utility_trailer" },
  ]);

  it("matches exactly, case- and spacing-insensitively", () => {
    expect(categoryDefaultForCategory("Utility Trailer", lookup)).toBe("utility_trailer");
    expect(categoryDefaultForCategory("  utility   trailer ", lookup)).toBe("utility_trailer");
  });

  it("does NOT fuzzy/substring match", () => {
    expect(categoryDefaultForCategory("Utility Trailer XL", lookup)).toBeNull();
    expect(categoryDefaultForCategory("Trailer", lookup)).toBeNull();
  });

  it("returns null for blank/absent categories or an empty lookup", () => {
    expect(categoryDefaultForCategory("", lookup)).toBeNull();
    expect(categoryDefaultForCategory(null, lookup)).toBeNull();
    expect(categoryDefaultForCategory("Utility Trailer", {})).toBeNull();
  });
});

describe("validateCategoryDefaultInput", () => {
  it("accepts a non-empty category + known template key and returns the normalized value", () => {
    const r = validateCategoryDefaultInput({ category: "  Dump Trailer ", templateKey: "utility_trailer" });
    expect(r).toEqual({
      value: {
        category_value: "Dump Trailer",
        normalized_category_value: "dump trailer",
        return_template_key: "utility_trailer",
      },
    });
  });

  it("rejects a blank category and an unknown template key", () => {
    expect("error" in validateCategoryDefaultInput({ category: "   ", templateKey: "utility_trailer" })).toBe(
      true
    );
    expect("error" in validateCategoryDefaultInput({ category: "Trailer", templateKey: "nope" })).toBe(true);
  });
});

describe("assetsToApplyDefault", () => {
  const lookup = buildCategoryDefaultLookup([
    { category_value: "Utility Trailer", return_template_key: "utility_trailer" },
  ]);
  const assets: AssetForDefault[] = [
    { id: "a1", category: "Utility Trailer", return_inspection_template_key: null }, // apply
    { id: "a2", category: "utility trailer", return_inspection_template_key: "generic" }, // explicit → skip
    { id: "a3", category: "Excavator", return_inspection_template_key: null }, // unmapped → skip
    { id: "a4", category: "Utility Trailer", return_inspection_template_key: null }, // apply
  ];

  it("targets only unassigned assets whose category maps to a default (explicit preserved)", () => {
    const targets = assetsToApplyDefault(assets, lookup);
    expect(targets).toEqual([
      { id: "a1", key: "utility_trailer" },
      { id: "a4", key: "utility_trailer" },
    ]);
  });
});

describe("category-default target lookup (Phase 2 custom targets)", () => {
  it("prefers a published custom template id over the system key and drops unknown keys", () => {
    const lookup = buildCategoryDefaultTargetLookup([
      { category_value: "Utility Trailer", return_template_key: "utility_trailer", return_template_id: "tmpl-1" },
      { category_value: "Generator", return_template_key: "portable_generator", return_template_id: null },
      { category_value: "Widget", return_template_key: "nope", return_template_id: null },
    ]);
    expect(lookup["utility trailer"]).toEqual({ templateId: "tmpl-1" });
    expect(lookup["generator"]).toEqual({ templateKey: "portable_generator" });
    expect(lookup).not.toHaveProperty("widget");
    expect(categoryDefaultTargetForCategory("  utility  trailer ", lookup)).toEqual({
      templateId: "tmpl-1",
    });
    expect(categoryDefaultTargetForCategory("nothing", lookup)).toBeNull();
  });
});

describe("Phase 2 — a custom template assignment counts as assigned", () => {
  const lookup = buildCategoryDefaultLookup([
    { category_value: "Utility Trailer", return_template_key: "utility_trailer" },
  ]);
  const assets: AssetForDefault[] = [
    { id: "c", category: "Utility Trailer", return_inspection_template_key: null, return_inspection_template_id: "tmpl-9" },
    { id: "n", category: "Utility Trailer", return_inspection_template_key: null },
  ];

  it("never re-applies a default to a custom-assigned asset", () => {
    expect(assetsToApplyDefault(assets, lookup).map((t) => t.id)).toEqual(["n"]);
  });

  it("does not flag a custom-assigned asset for review (retired-custom is handled server-side)", () => {
    const flagged = classifyReviewAssets(assets, lookup).map((r) => r.id);
    expect(flagged).toEqual(["n"]); // only the unassigned one
    expect(flagged).not.toContain("c");
  });
});

describe("classifyReviewAssets", () => {
  const lookup = buildCategoryDefaultLookup([
    { category_value: "Utility Trailer", return_template_key: "utility_trailer" },
  ]);
  const assets: AssetForDefault[] = [
    { id: "u", category: "Utility Trailer", return_inspection_template_key: null }, // unassigned
    { id: "g", category: "Utility Trailer", return_inspection_template_key: "generic" }, // generic
    { id: "d", category: "Utility Trailer", return_inspection_template_key: "portable_generator" }, // differs
    { id: "ok", category: "Utility Trailer", return_inspection_template_key: "utility_trailer" }, // matches → not flagged
    { id: "nd", category: "Excavator", return_inspection_template_key: "portable_generator" }, // no default → not flagged
  ];

  it("flags unassigned, generic, and differing-from-default (never the matching or no-default cases)", () => {
    const byId = Object.fromEntries(classifyReviewAssets(assets, lookup).map((r) => [r.id, r.reason]));
    expect(byId).toEqual({
      u: "unassigned",
      g: "generic",
      d: "differs_from_default",
    });
    // Matching explicit + no-default explicit are absent (not errors).
    expect(byId).not.toHaveProperty("ok");
    expect(byId).not.toHaveProperty("nd");
  });
});
