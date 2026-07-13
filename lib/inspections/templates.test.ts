import { describe, expect, it } from "vitest";

import {
  ADDITIONAL_PHOTOS_SLOT_ID,
  RETURN_TEMPLATE_KEYS,
  RETURN_TEMPLATES,
  getReturnTemplate,
} from "./templates";
import type { InspectionField } from "./types";

function allFields(sectionFields: InspectionField[]): InspectionField[] {
  return sectionFields;
}

describe("return templates — Phase 1A.1 structure", () => {
  it.each(RETURN_TEMPLATE_KEYS)("%s has an optional additional-photos slot near the end", (key) => {
    const template = getReturnTemplate(key);
    const sectionIds = template.sections.map((s) => s.id);

    // The additional-photos section exists, after accessories/damage and before confirmation.
    const additionalIdx = sectionIds.indexOf("additional_photos");
    const confirmationIdx = sectionIds.indexOf("confirmation");
    const accessoriesIdx = sectionIds.indexOf("accessories");
    expect(additionalIdx).toBeGreaterThan(accessoriesIdx);
    expect(additionalIdx).toBeLessThan(confirmationIdx);

    // The slot itself is an optional photo_slot with a stable id and minPhotos 0.
    const slot = template.sections
      .flatMap((s) => allFields(s.fields))
      .find((f) => f.id === ADDITIONAL_PHOTOS_SLOT_ID);
    expect(slot?.type).toBe("photo_slot");
    expect(slot?.required).not.toBe(true);
    expect(slot?.photo?.minPhotos).toBe(0);
  });

  it.each(RETURN_TEMPLATE_KEYS)("%s keeps a required-ish overview photo in the first section", (key) => {
    const template = getReturnTemplate(key);
    const firstSection = template.sections[0];
    expect(firstSection.id).toBe("photos");
    expect(firstSection.fields.some((f) => f.type === "photo_slot")).toBe(true);
  });

  it.each(RETURN_TEMPLATE_KEYS)("%s ends with the attestation confirmation section", (key) => {
    const template = getReturnTemplate(key);
    const last = template.sections[template.sections.length - 1];
    expect(last.id).toBe("confirmation");
    expect(last.fields.some((f) => f.type === "acknowledgement" && f.required)).toBe(true);
  });

  it("does not duplicate the additional-photos slot id with any other field", () => {
    for (const key of RETURN_TEMPLATE_KEYS) {
      const ids = RETURN_TEMPLATES[key].sections.flatMap((s) => s.fields.map((f) => f.id));
      const count = ids.filter((id) => id === ADDITIONAL_PHOTOS_SLOT_ID).length;
      expect(count).toBe(1);
    }
  });
});
