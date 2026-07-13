import { describe, expect, it } from "vitest";

import {
  copyFromSystemTemplate,
  nextVersionNumber,
  validateOrgTemplateDefinition,
} from "./org-templates";
import type { InspectionTemplate } from "./types";

/** A fresh, valid definition seeded from a system template. */
function seed(): InspectionTemplate {
  return copyFromSystemTemplate("utility_trailer", "fam-abc");
}

describe("copyFromSystemTemplate", () => {
  it("clones a system template with the family key + version 1 and validates", () => {
    const def = seed();
    expect(def.key).toBe("fam-abc");
    expect(def.version).toBe("1");
    expect(def.inspection_type).toBe("return");
    expect(def.sections.length).toBeGreaterThan(0);
    const r = validateOrgTemplateDefinition(def);
    expect("value" in r).toBe(true);
  });
});

describe("nextVersionNumber", () => {
  it("starts at 1 and increments past the max", () => {
    expect(nextVersionNumber([])).toBe(1);
    expect(nextVersionNumber([1, 2, 5])).toBe(6);
  });
});

describe("validateOrgTemplateDefinition", () => {
  it("rejects an unsupported field type (malicious field)", () => {
    const def = seed();
    // Force an unsupported type onto the first field.
    (def.sections[1].fields[0] as unknown as { type: string }).type = "iframe_embed";
    const r = validateOrgTemplateDefinition(def);
    expect("error" in r && /unsupported field type/i.test(r.error)).toBe(true);
  });

  it("rejects a removed attestation (legal footer cannot be deleted)", () => {
    const def = seed();
    for (const s of def.sections) {
      s.fields = s.fields.filter((f) => f.type !== "acknowledgement");
    }
    const r = validateOrgTemplateDefinition(def);
    expect("error" in r && /attestation/i.test(r.error)).toBe(true);
  });

  it("rejects an empty field label and duplicate field ids", () => {
    const empty = seed();
    empty.sections[1].fields[0].label = "   ";
    expect("error" in validateOrgTemplateDefinition(empty)).toBe(true);

    const dup = seed();
    dup.sections[1].fields[1].id = dup.sections[1].fields[0].id;
    expect("error" in validateOrgTemplateDefinition(dup)).toBe(true);
  });

  it("rejects out-of-bound photo slots", () => {
    const def = seed();
    const photo = def.sections[0].fields.find((f) => f.type === "photo_slot");
    expect(photo).toBeTruthy();
    photo!.photo = { minPhotos: 3, maxPhotos: 1 }; // min > max
    expect("error" in validateOrgTemplateDefinition(def)).toBe(true);
  });

  it("strips unknown/unsafe keys and keeps only sanctioned condition keys", () => {
    const def = seed() as unknown as Record<string, unknown>;
    // Smuggle an unsafe prop onto a field and a bogus operator onto a condition.
    const section = (def.sections as InspectionTemplate["sections"])[3]; // damage_details (conditional)
    (section as unknown as { onClick: string }).onClick = "alert(1)";
    (section.visible_when as unknown as { op: string }).op = "regex";
    const r = validateOrgTemplateDefinition(def);
    expect("value" in r).toBe(true);
    if ("value" in r) {
      const s = r.value.sections.find((x) => x.id === "damage_details")!;
      expect(s).not.toHaveProperty("onClick");
      expect(Object.keys(s.visible_when!).sort()).toEqual(["equals", "field"]);
    }
  });

  it("rejects a malformed condition (missing equals)", () => {
    const def = seed();
    const damage = def.sections.find((s) => s.id === "damage_details")!;
    (damage.visible_when as unknown as { equals?: string }).equals = undefined;
    delete (damage.visible_when as unknown as { equals?: string }).equals;
    expect("error" in validateOrgTemplateDefinition(def)).toBe(true);
  });
});
