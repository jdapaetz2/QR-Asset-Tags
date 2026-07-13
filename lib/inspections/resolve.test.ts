import { describe, expect, it } from "vitest";

import {
  normalizeAlias,
  resolveReturnTemplate,
  resolveReturnTemplateKey,
  returnTemplateName,
  suggestTemplateKeyFromCategory,
} from "./resolve";
import { GENERIC_TEMPLATE_KEY } from "./templates";

describe("normalizeAlias", () => {
  it("trims, lowercases, and collapses internal whitespace only", () => {
    expect(normalizeAlias("  Utility   Trailer ")).toBe("utility trailer");
    expect(normalizeAlias("SKID\tSTEER")).toBe("skid steer");
  });
});

describe("suggestTemplateKeyFromCategory", () => {
  it("matches every approved exact alias", () => {
    const cases: Record<string, string> = {
      "utility trailer": "utility_trailer",
      "equipment trailer": "utility_trailer",
      "dump trailer": "utility_trailer",
      "mini excavator": "mini_excavator_skid_steer",
      excavator: "mini_excavator_skid_steer",
      "compact excavator": "mini_excavator_skid_steer",
      "skid steer": "mini_excavator_skid_steer",
      "portable generator": "portable_generator",
      generator: "portable_generator",
      "towable generator": "portable_generator",
      "plate compactor": "plate_compactor",
      compactor: "plate_compactor",
      "electrical test equipment": "electrical_test_equipment",
      electrical: "electrical_test_equipment",
      "test equipment": "electrical_test_equipment",
    };
    for (const [category, key] of Object.entries(cases)) {
      expect(suggestTemplateKeyFromCategory(category)).toBe(key);
      // Case/whitespace-insensitive, but still exact.
      expect(suggestTemplateKeyFromCategory(`  ${category.toUpperCase()}  `)).toBe(key);
    }
  });

  it("does NOT fuzzy/substring match", () => {
    expect(suggestTemplateKeyFromCategory("mini excavator xl")).toBeNull();
    expect(suggestTemplateKeyFromCategory("trailer")).toBeNull();
    expect(suggestTemplateKeyFromCategory("diesel generator")).toBeNull();
    expect(suggestTemplateKeyFromCategory("electrical panel")).toBeNull();
  });

  it("returns null for blank/absent categories", () => {
    expect(suggestTemplateKeyFromCategory("")).toBeNull();
    expect(suggestTemplateKeyFromCategory("   ")).toBeNull();
    expect(suggestTemplateKeyFromCategory(null)).toBeNull();
    expect(suggestTemplateKeyFromCategory(undefined)).toBeNull();
  });
});

describe("resolveReturnTemplateKey", () => {
  it("prefers a valid explicit assignment over the category suggestion", () => {
    expect(
      resolveReturnTemplateKey({
        assignmentKey: "plate_compactor",
        category: "Mini Excavator",
      })
    ).toEqual({ key: "plate_compactor", source: "assigned" });
  });

  it("falls through an invalid/blank assignment to the suggestion", () => {
    expect(
      resolveReturnTemplateKey({ assignmentKey: "not_a_key", category: "Dump Trailer" })
    ).toEqual({ key: "utility_trailer", source: "suggested" });
    expect(
      resolveReturnTemplateKey({ assignmentKey: "", category: "Skid Steer" })
    ).toEqual({ key: "mini_excavator_skid_steer", source: "suggested" });
    expect(
      resolveReturnTemplateKey({ assignmentKey: null, category: "Generator" })
    ).toEqual({ key: "portable_generator", source: "suggested" });
  });

  it("uses generic when neither assignment nor suggestion applies", () => {
    expect(
      resolveReturnTemplateKey({ assignmentKey: null, category: "Scaffolding" })
    ).toEqual({ key: GENERIC_TEMPLATE_KEY, source: "generic" });
    expect(
      resolveReturnTemplateKey({ assignmentKey: null, category: null })
    ).toEqual({ key: GENERIC_TEMPLATE_KEY, source: "generic" });
  });

  it("preserves an explicit key even when the category would suggest another (no silent rewrite)", () => {
    // The resolver never overwrites a stored explicit assignment from the category.
    const r = resolveReturnTemplateKey({
      assignmentKey: "generic",
      category: "Mini Excavator",
    });
    expect(r).toEqual({ key: "generic", source: "assigned" });
  });
});

describe("resolveReturnTemplate / returnTemplateName", () => {
  it("returns the full template for a resolved key", () => {
    const tpl = resolveReturnTemplate({ assignmentKey: "utility_trailer", category: null });
    expect(tpl.key).toBe("utility_trailer");
    expect(tpl.inspection_type).toBe("return");
    expect(tpl.sections.length).toBeGreaterThan(0);
  });

  it("names known keys and falls back to generic for unknown", () => {
    expect(returnTemplateName("portable_generator")).toBe("Portable generator");
    expect(returnTemplateName("nope")).toBe(returnTemplateName(GENERIC_TEMPLATE_KEY));
    expect(returnTemplateName(null)).toBe(returnTemplateName(GENERIC_TEMPLATE_KEY));
  });
});
