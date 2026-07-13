import { describe, expect, it } from "vitest";

import {
  resolveStaffReturnTemplate,
  stripAttestation,
} from "./staff-return-templates";
import { RETURN_TEMPLATES, RETURN_TEMPLATE_KEYS } from "./templates";

const allFields = (t: { sections: { fields: { type: string; id: string }[] }[] }) =>
  t.sections.flatMap((s) => s.fields);

describe("stripAttestation", () => {
  it("removes every acknowledgement field and the now-empty confirmation section", () => {
    const base = RETURN_TEMPLATES.generic;
    const staff = stripAttestation(base);
    expect(allFields(staff).some((f) => f.type === "acknowledgement")).toBe(false);
    // The "confirmation" section held only the attestation → it is dropped entirely.
    expect(staff.sections.some((s) => s.id === "confirmation")).toBe(false);
    // Non-attestation content survives (photos, condition, accessories).
    expect(staff.sections.some((s) => s.id === "photos")).toBe(true);
    expect(staff.inspection_type).toBe("return");
  });

  it("does not mutate the source template (public return keeps its attestation)", () => {
    stripAttestation(RETURN_TEMPLATES.generic);
    expect(
      allFields(RETURN_TEMPLATES.generic).some((f) => f.type === "acknowledgement")
    ).toBe(true);
  });

  it("every system return template still ships an attestation (guards the public form)", () => {
    for (const key of RETURN_TEMPLATE_KEYS) {
      expect(
        allFields(RETURN_TEMPLATES[key]).some((f) => f.type === "acknowledgement")
      ).toBe(true);
    }
  });
});

describe("resolveStaffReturnTemplate", () => {
  it("resolves the asset's system key, attestation stripped, type still 'return'", () => {
    const t = resolveStaffReturnTemplate({ assignmentKey: "utility_trailer", category: null });
    expect(t.key).toBe("utility_trailer");
    expect(t.inspection_type).toBe("return");
    expect(allFields(t).some((f) => f.type === "acknowledgement")).toBe(false);
  });

  it("falls back category → generic like the public resolver", () => {
    expect(
      resolveStaffReturnTemplate({ assignmentKey: null, category: "Mini Excavator" }).key
    ).toBe("mini_excavator_skid_steer");
    expect(resolveStaffReturnTemplate({ assignmentKey: null, category: "Spaceship" }).key).toBe(
      "generic"
    );
    expect(resolveStaffReturnTemplate({ assignmentKey: "nope", category: null }).key).toBe(
      "generic"
    );
  });
});
