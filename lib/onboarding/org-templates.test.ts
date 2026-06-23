import { describe, expect, it } from "vitest";

import {
  isTemplateSlug,
  resolveImportTemplate,
  validateTemplateForm,
  type TemplateContent,
} from "./org-templates";

describe("isTemplateSlug", () => {
  it("accepts lowercase slug and rejects bad shapes", () => {
    expect(isTemplateSlug("electrical_meter_kit")).toBe(true);
    expect(isTemplateSlug("ex01")).toBe(true);
    expect(isTemplateSlug("X")).toBe(false);
    expect(isTemplateSlug("Has Space")).toBe(false);
    expect(isTemplateSlug("UPPER")).toBe(false);
    expect(isTemplateSlug("a")).toBe(false);
    expect(isTemplateSlug("with-dash")).toBe(false);
  });
});

describe("validateTemplateForm", () => {
  it("requires a name and a valid key", () => {
    expect(validateTemplateForm({ key: "k1" }).error).toMatch(/name/i);
    expect(validateTemplateForm({ name: "X" }).error).toMatch(/key/i);
    expect(
      validateTemplateForm({ name: "X", key: "Bad Key" }).error
    ).toMatch(/key/i);
  });

  it("normalizes fields and lowercases the key; never includes organization_id", () => {
    const result = validateTemplateForm({
      name: "  Electrical Meter Kit ",
      key: "  Electrical_Meter_Kit ",
      description: " desc ",
      return_notes: " return the leads ",
      fuel_power_notes: "",
      is_active: "on",
      organization_id: "attacker",
    } as Record<string, string>);
    expect(result.value?.key).toBe("electrical_meter_kit");
    expect(result.value?.name).toBe("Electrical Meter Kit");
    expect(result.value?.return_notes).toBe("return the leads");
    expect(result.value?.fuel_power_notes).toBeNull();
    expect(result.value?.is_active).toBe(true);
    expect(result.value).not.toHaveProperty("organization_id");
  });
});

const orgContent: TemplateContent = {
  headline: "Org headline",
  quick_start_text: null,
  safety_notes: null,
  fuel_power_notes: null,
  return_notes: "Return the probes and carry case.",
  troubleshooting_notes: null,
  emergency_notes: null,
};

describe("resolveImportTemplate", () => {
  it("uses an org template over a same-key system template", () => {
    const map = new Map([["electrical_test_equipment", orgContent]]);
    const resolved = resolveImportTemplate("electrical_test_equipment", map);
    expect(resolved?.headline).toBe("Org headline");
    expect(resolved?.return_notes).toMatch(/carry case/);
  });

  it("falls back to the system template when the org has none", () => {
    const resolved = resolveImportTemplate("mini_excavator", new Map());
    expect(resolved?.headline).toMatch(/excavator/i);
  });

  it("returns null for an unknown key", () => {
    expect(resolveImportTemplate("forklift", new Map())).toBeNull();
  });

  it("system electrical fallback still avoids fuel/engine language", () => {
    const resolved = resolveImportTemplate("electrical_test_equipment", new Map());
    const text = Object.values(resolved ?? {})
      .filter((v): v is string => typeof v === "string")
      .join(" ")
      .toLowerCase();
    for (const banned of ["engine", "fuel", "oil", "hydraulic"]) {
      expect(text).not.toContain(banned);
    }
  });
});
