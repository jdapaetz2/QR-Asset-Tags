import { describe, expect, it } from "vitest";

import { INSPECTION_STAGES, sectionStage } from "./stages";
import { RETURN_TEMPLATES, RETURN_TEMPLATE_KEYS } from "./templates";
import { OUTBOUND_TEMPLATES, OUTBOUND_TEMPLATE_KEYS } from "./outbound-templates";
import type { InspectionSection } from "./types";

const mk = (id: string, stage?: "condition" | "return_details"): InspectionSection => ({
  id,
  title: id,
  stage,
  fields: [],
});

describe("sectionStage", () => {
  it("infers Return details from the known section ids, else Condition", () => {
    expect(sectionStage(mk("photos"))).toBe("condition");
    expect(sectionStage(mk("condition"))).toBe("condition");
    expect(sectionStage(mk("accessories"))).toBe("return_details");
    expect(sectionStage(mk("damage_details"))).toBe("return_details");
    expect(sectionStage(mk("additional_photos"))).toBe("return_details");
    expect(sectionStage(mk("confirmation"))).toBe("return_details");
    // Unknown / custom section id → Condition (never a fourth stage).
    expect(sectionStage(mk("custom_widget"))).toBe("condition");
  });

  it("an explicit stage overrides the id inference", () => {
    expect(sectionStage(mk("accessories", "condition"))).toBe("condition");
    expect(sectionStage(mk("photos", "return_details"))).toBe("return_details");
  });
});

describe("every template collapses to at most the two in-form stages (≤3 primary)", () => {
  it.each(RETURN_TEMPLATE_KEYS)("return template %s", (key) => {
    const stages = new Set(RETURN_TEMPLATES[key].sections.map(sectionStage));
    for (const s of stages) expect(INSPECTION_STAGES).toContain(s);
    // Real templates use both a condition and a return-details stage.
    expect(stages.has("condition")).toBe(true);
    expect(stages.has("return_details")).toBe(true);
  });

  it.each(OUTBOUND_TEMPLATE_KEYS)("outbound template %s", (key) => {
    const stages = new Set(OUTBOUND_TEMPLATES[key].sections.map(sectionStage));
    for (const s of stages) expect(INSPECTION_STAGES).toContain(s);
  });
});
