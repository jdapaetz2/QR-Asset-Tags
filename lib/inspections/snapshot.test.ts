import { describe, expect, it } from "vitest";

import { buildReturnSubmissionData, buildTemplateSnapshot } from "./snapshot";
import { RETURN_TEMPLATES } from "./templates";
import type { InspectionAnswers, InspectionFlags } from "./types";

const template = RETURN_TEMPLATES.utility_trailer;

describe("buildTemplateSnapshot", () => {
  it("is a deep, value-equal copy independent of the source", () => {
    const snap = buildTemplateSnapshot(template);
    expect(snap).toEqual(template);
    expect(snap).not.toBe(template);
    expect(snap.sections).not.toBe(template.sections);

    // Mutating the snapshot must never reach the live template.
    snap.sections[0].title = "MUTATED";
    expect(template.sections[0].title).not.toBe("MUTATED");
  });
});

describe("buildReturnSubmissionData", () => {
  const answers: InspectionAnswers = {
    values: { tires_wheels: "pass", damage_observed: "yes" },
    photos: { front_hitch_photo: [{ path: "org/o/asset/a/submission/s/x.jpg", caption: "Front" }] },
  };
  const flags: InspectionFlags = { damage_observed: "yes", accessories_missing: true };

  it("produces the V2 submission_data_json with a frozen snapshot and canonical flags", () => {
    const data = buildReturnSubmissionData({ template, answers, flags });
    expect(data.schema_version).toBe(2);
    expect(data.template_key).toBe("utility_trailer");
    expect(data.template_version).toBe(template.version);
    expect(data.template_snapshot).toEqual(template);
    expect(data.template_snapshot).not.toBe(template);
    expect(data.answers).toBe(answers);
    expect(data.flags).toEqual({ damage_observed: "yes", accessories_missing: true });
  });
});
