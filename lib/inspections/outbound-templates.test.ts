import { describe, expect, it } from "vitest";

import {
  GENERIC_OUTBOUND_KEY,
  OUTBOUND_TEMPLATES,
  OUTBOUND_TEMPLATE_KEYS,
  getOutboundTemplate,
  isOutboundTemplateKey,
  resolveOutboundTemplate,
} from "./outbound-templates";
import { RETURN_TEMPLATE_KEYS } from "./templates";

describe("outbound templates", () => {
  it("mirror the return template keys", () => {
    expect([...OUTBOUND_TEMPLATE_KEYS].sort()).toEqual([...RETURN_TEMPLATE_KEYS].sort());
  });

  it.each(OUTBOUND_TEMPLATE_KEYS)("%s is an outbound baseline with the required shape", (key) => {
    const t = getOutboundTemplate(key);
    expect(t.inspection_type).toBe("outbound");

    // A photos section with an overview photo slot.
    expect(t.sections[0].id).toBe("photos");
    expect(t.sections[0].fields.some((f) => f.type === "photo_slot")).toBe(true);

    const allFields = t.sections.flatMap((s) => s.fields);
    // Every outbound baseline carries an existing-damage flag + an accessories-issued flag + notes.
    expect(allFields.some((f) => f.flag === "damage_observed")).toBe(true);
    expect(allFields.some((f) => f.flag === "accessories")).toBe(true);
    expect(allFields.some((f) => f.id === "condition_notes")).toBe(true);

    // Ends with a required staff attestation.
    const last = t.sections[t.sections.length - 1];
    expect(last.id).toBe("confirmation");
    expect(last.fields.some((f) => f.type === "acknowledgement" && f.required)).toBe(true);
  });

  it("are version-bumped for the soft-photos + accessory change (Phase 3C.6)", () => {
    for (const t of Object.values(OUTBOUND_TEMPLATES)) expect(t.version).toBe("2026-08-1");
  });

  it("every photo slot is SOFT — non-blocking (required:false, min:0) (Phase 3C.6)", () => {
    for (const t of Object.values(OUTBOUND_TEMPLATES)) {
      for (const field of t.sections.flatMap((s) => s.fields)) {
        if (field.type !== "photo_slot") continue;
        expect(field.required).toBe(false);
        expect(field.photo?.minPhotos ?? 0).toBe(0);
      }
    }
  });

  it("adds a conditional existing-damage photo section shown only when damage is reported", () => {
    for (const t of Object.values(OUTBOUND_TEMPLATES)) {
      const damage = t.sections.find((s) => s.id === "damage_details");
      expect(damage).toBeDefined();
      expect(damage!.visible_when).toEqual({ field: "existing_damage", equals: "yes" });
      expect(damage!.fields.some((f) => f.type === "photo_slot" && f.id === "damage_photos")).toBe(true);
    }
  });

  it("captures meter/hours + fuel on powered equipment", () => {
    const excavator = OUTBOUND_TEMPLATES.mini_excavator_skid_steer.sections.flatMap((s) => s.fields);
    expect(excavator.some((f) => f.type === "numeric_meter")).toBe(true);
    expect(excavator.some((f) => f.type === "fuel_charge_level")).toBe(true);
    const generator = OUTBOUND_TEMPLATES.portable_generator.sections.flatMap((s) => s.fields);
    expect(generator.some((f) => f.type === "fuel_charge_level")).toBe(true);
  });
});

describe("resolveOutboundTemplate", () => {
  it("uses the asset's explicit system key (mirrored as an outbound key)", () => {
    expect(resolveOutboundTemplate({ assignmentKey: "utility_trailer", category: null }).key).toBe(
      "utility_trailer"
    );
  });

  it("falls back to the exact category suggestion, then generic", () => {
    expect(resolveOutboundTemplate({ assignmentKey: null, category: "Mini Excavator" }).key).toBe(
      "mini_excavator_skid_steer"
    );
    expect(resolveOutboundTemplate({ assignmentKey: null, category: "Scaffolding" }).key).toBe(
      GENERIC_OUTBOUND_KEY
    );
    expect(resolveOutboundTemplate({ assignmentKey: "nope", category: null }).key).toBe(
      GENERIC_OUTBOUND_KEY
    );
  });

  it("isOutboundTemplateKey guards the registry", () => {
    expect(isOutboundTemplateKey("portable_generator")).toBe(true);
    expect(isOutboundTemplateKey("spaceship")).toBe(false);
  });
});
