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

// Phase 1B — organization category defaults tier (assigned → category_default → suggested → generic).
describe("resolveReturnTemplateKey with organization category defaults", () => {
  // A category the built-in aliases would NOT match, mapped by the org to plate_compactor.
  const categoryDefaults = { "widget cart": "plate_compactor" as const };

  it("uses the org category default when there is no explicit assignment", () => {
    expect(
      resolveReturnTemplateKey({ assignmentKey: null, category: "Widget Cart", categoryDefaults })
    ).toEqual({ key: "plate_compactor", source: "category_default" });
  });

  it("lets an explicit assignment win over the category default", () => {
    expect(
      resolveReturnTemplateKey({
        assignmentKey: "utility_trailer",
        category: "Widget Cart",
        categoryDefaults,
      })
    ).toEqual({ key: "utility_trailer", source: "assigned" });
  });

  it("prefers the org default over the built-in system suggestion", () => {
    // "Dump Trailer" aliases to utility_trailer, but the org remaps it to plate_compactor.
    expect(
      resolveReturnTemplateKey({
        assignmentKey: null,
        category: "Dump Trailer",
        categoryDefaults: { "dump trailer": "plate_compactor" },
      })
    ).toEqual({ key: "plate_compactor", source: "category_default" });
  });

  it("falls back to the system suggestion, then generic, when no default matches", () => {
    expect(
      resolveReturnTemplateKey({ assignmentKey: null, category: "Dump Trailer", categoryDefaults })
    ).toEqual({ key: "utility_trailer", source: "suggested" });
    expect(
      resolveReturnTemplateKey({ assignmentKey: null, category: "Nothing", categoryDefaults })
    ).toEqual({ key: GENERIC_TEMPLATE_KEY, source: "generic" });
  });

  it("only affects future resolution — omitting the lookup reverts to Phase 1A behavior", () => {
    const withDefault = resolveReturnTemplateKey({
      assignmentKey: null,
      category: "Widget Cart",
      categoryDefaults,
    });
    const withoutDefault = resolveReturnTemplateKey({
      assignmentKey: null,
      category: "Widget Cart",
    });
    expect(withDefault.key).toBe("plate_compactor");
    expect(withoutDefault).toEqual({ key: GENERIC_TEMPLATE_KEY, source: "generic" });
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
