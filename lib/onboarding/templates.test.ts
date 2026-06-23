import { describe, expect, it } from "vitest";

import {
  EQUIPMENT_TEMPLATES,
  TEMPLATE_KEYS,
  TEMPLATE_META,
  isTemplateKey,
  templateCatalog,
} from "./templates";

describe("equipment templates", () => {
  it("includes all eight expected keys", () => {
    expect(TEMPLATE_KEYS.sort()).toEqual(
      [
        "air_compressor",
        "electrical_test_equipment",
        "mini_excavator",
        "plate_compactor",
        "portable_generator",
        "scissor_lift",
        "skid_steer",
        "utility_trailer",
      ].sort()
    );
  });

  it("fills the seven page fields for every template", () => {
    for (const key of TEMPLATE_KEYS) {
      const t = EQUIPMENT_TEMPLATES[key];
      expect(t.headline).toBeTruthy();
      expect(t.quick_start_text).toBeTruthy();
      expect(t.safety_notes).toBeTruthy();
      expect(t.return_notes).toBeTruthy();
      expect(t.troubleshooting_notes).toBeTruthy();
      expect(t.emergency_notes).toBeTruthy();
      // fuel_power_notes may be null (e.g. trailer).
      expect(t).toHaveProperty("fuel_power_notes");
    }
  });

  it("electrical test equipment avoids engine/fuel/oil/hydraulic/warm-up language", () => {
    const all = Object.values(EQUIPMENT_TEMPLATES.electrical_test_equipment)
      .filter((v): v is string => typeof v === "string")
      .join(" ")
      .toLowerCase();
    for (const banned of [
      "engine",
      "fuel",
      "oil",
      "hydraulic",
      "warm-up",
      "warm up",
      "refuel",
    ]) {
      expect(all).not.toContain(banned);
    }
    // …and it focuses on the right things.
    expect(all).toContain("lead");
    expect(all).toContain("probe");
    expect(all).toContain("case");
  });

  it("recognizes known keys and rejects unknown", () => {
    expect(isTemplateKey("mini_excavator")).toBe(true);
    expect(isTemplateKey("forklift")).toBe(false);
    expect(isTemplateKey("")).toBe(false);
  });

  it("has catalog metadata (name/type/description) for every key", () => {
    for (const key of TEMPLATE_KEYS) {
      const meta = TEMPLATE_META[key];
      expect(meta.name).toBeTruthy();
      expect(meta.equipmentType).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });
});

describe("templateCatalog", () => {
  it("returns every template with all seven labeled fields", () => {
    const catalog = templateCatalog();
    expect(catalog).toHaveLength(TEMPLATE_KEYS.length);
    for (const entry of catalog) {
      expect(entry.key).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.fields.map((f) => f.label)).toEqual([
        "Headline",
        "Quick start",
        "Safety",
        "Fuel / power",
        "Return",
        "Troubleshooting",
        "Emergency",
      ]);
    }
  });

  it("previews electrical test equipment with no fuel/engine field content", () => {
    const electrical = templateCatalog().find(
      (e) => e.key === "electrical_test_equipment"
    )!;
    const text = electrical.fields
      .map((f) => f.value ?? "")
      .join(" ")
      .toLowerCase();
    for (const banned of ["engine", "fuel", "oil", "hydraulic"]) {
      expect(text).not.toContain(banned);
    }
  });
});
