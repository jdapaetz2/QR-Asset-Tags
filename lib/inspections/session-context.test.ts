import { describe, expect, it } from "vitest";

import { outboundBaselineHints, summarizeRenterReport } from "./session-context";
import type { InspectionTemplate, ReturnInspectionData } from "@/lib/inspections/types";

const template: InspectionTemplate = {
  key: "portable_generator",
  version: "2026-07-1",
  inspection_type: "outbound",
  name: "Portable generator",
  description: "",
  equipmentTypes: [],
  sections: [
    {
      id: "condition",
      title: "Condition",
      fields: [
        { id: "run_hours", type: "numeric_meter", label: "Run hours", unit: "hours" },
        { id: "oil_level", type: "pass_fail_na", label: "Oil level", required: true },
        {
          id: "accessories",
          type: "accessory_checklist",
          label: "Accessories",
          flag: "accessories",
          items: [
            { id: "cords", label: "Cords" },
            { id: "wheel_kit", label: "Wheel kit" },
            { id: "manual", label: "Manual" },
          ],
        },
        { id: "overall_photo", type: "photo_slot", label: "Overall photo", photo: { minPhotos: 1, maxPhotos: 6 } },
      ],
    },
  ],
};

function outboundData(): ReturnInspectionData {
  return {
    schema_version: 2,
    template_key: "portable_generator",
    template_version: "2026-07-1",
    template_snapshot: template,
    answers: {
      values: {
        run_hours: 783,
        oil_level: "pass",
        accessories: { cords: "returned", wheel_kit: "returned", manual: "returned" },
      } as never,
      photos: { overall_photo: [{ path: "o.jpg", caption: "x" }] },
    },
    flags: { damage_observed: "no", accessories_missing: false },
  };
}

describe("outboundBaselineHints", () => {
  it("produces compact per-field baseline hints", () => {
    const h = outboundBaselineHints(outboundData());
    expect(h.run_hours).toBe("Outbound: 783 hours");
    expect(h.oil_level).toBe("Outbound: Pass");
    expect(h.accessories).toBe("Expected: Cords, Wheel kit, Manual");
    expect(h.overall_photo).toBe("Outbound photo available");
  });

  it("returns an empty map for a missing baseline", () => {
    expect(outboundBaselineHints(null)).toEqual({});
    expect(outboundBaselineHints(undefined)).toEqual({});
  });
});

describe("summarizeRenterReport", () => {
  it("summarizes V2 damage/missing flags, notes, and photo count", () => {
    const v2: ReturnInspectionData = {
      schema_version: 2,
      template_key: "generic",
      template_version: "2026-07-1",
      template_snapshot: template,
      answers: {
        values: { condition_notes: "Scratch on the panel" } as never,
        photos: {},
      },
      flags: { damage_observed: "yes", accessories_missing: true },
    };
    const s = summarizeRenterReport({
      id: "a1b2c3d4-0000-0000-0000-000000000000",
      created_at: "2026-05-01T00:00:00Z",
      submission_data_json: v2,
      media_urls: ["a.jpg", "b.jpg"],
    });
    expect(s.reference).toBe("SUB-2026-A1B2C3");
    expect(s.damage).toBe(true);
    expect(s.missing).toBe(true);
    expect(s.notes).toBe("Scratch on the panel");
    expect(s.photoCount).toBe(2);
  });

  it("reads V1 flat flags too", () => {
    const s = summarizeRenterReport({
      id: "ffffff",
      created_at: "2026-05-01T00:00:00Z",
      submission_data_json: { damage_observed: "yes", accessories_returned: "no", condition_notes: "ok" },
      media_urls: [],
    });
    expect(s.damage).toBe(true);
    expect(s.missing).toBe(true);
    expect(s.notes).toBe("ok");
    expect(s.photoCount).toBe(0);
  });
});
