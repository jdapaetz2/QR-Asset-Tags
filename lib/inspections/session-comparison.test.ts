import { describe, expect, it } from "vitest";

import {
  buildSessionComparison,
  photoSlotsBySource,
} from "./session-comparison";
import type {
  InspectionField,
  InspectionTemplate,
  ReturnInspectionData,
} from "@/lib/inspections/types";

const FIELDS: InspectionField[] = [
  { id: "engine_hours", type: "numeric_meter", label: "Engine hours", unit: "hours" },
  { id: "oil_level", type: "pass_fail_na", label: "Oil level", required: true },
  {
    id: "accessories",
    type: "accessory_checklist",
    label: "Accessories",
    flag: "accessories",
    items: [
      { id: "cords", label: "Cords" },
      { id: "manual", label: "Manual" },
    ],
  },
  { id: "damage_observed", type: "yes_no", label: "Damage observed?", flag: "damage_observed" },
  { id: "overall_photo", type: "photo_slot", label: "Overall photo", photo: { minPhotos: 1, maxPhotos: 6 } },
];

function template(type: "return" | "outbound"): InspectionTemplate {
  return {
    key: "mini_excavator_skid_steer",
    version: "2026-07-1",
    inspection_type: type,
    name: "Mini excavator",
    description: "",
    equipmentTypes: [],
    sections: [{ id: "s", title: "Condition", fields: FIELDS }],
  };
}

function data(
  type: "return" | "outbound",
  values: Record<string, unknown>,
  flags: { damage_observed: "yes" | "no"; accessories_missing: boolean },
  photos: Record<string, { path: string; caption: string }[]> = {}
): ReturnInspectionData {
  return {
    schema_version: 2,
    template_key: "mini_excavator_skid_steer",
    template_version: "2026-07-1",
    template_snapshot: template(type),
    answers: { values: values as never, photos },
    flags,
  };
}

describe("buildSessionComparison", () => {
  it("computes meter delta, condition downgrade, and accessory difference", () => {
    const outbound = data(
      "outbound",
      { engine_hours: 783, oil_level: "pass", accessories: { cords: "returned", manual: "returned" }, damage_observed: "no" },
      { damage_observed: "no", accessories_missing: false },
      { overall_photo: [{ path: "o.jpg", caption: "x" }] }
    );
    const staff = data(
      "return",
      { engine_hours: 812, oil_level: "fail", accessories: { cords: "returned", manual: "missing" }, damage_observed: "yes" },
      { damage_observed: "yes", accessories_missing: true },
      { overall_photo: [{ path: "s.jpg", caption: "x" }] }
    );

    const c = buildSessionComparison({ outbound, staff, renterReports: [] });
    expect(c.hasOutbound).toBe(true);
    expect(c.hasStaff).toBe(true);
    expect(c.hasRenter).toBe(false);

    const meter = c.rows.find((r) => r.fieldId === "engine_hours");
    expect(meter?.delta).toBe("+29 hours");
    expect(meter?.note).toBe("Difference recorded");

    const oil = c.rows.find((r) => r.fieldId === "oil_level");
    expect(oil?.changed).toBe(true);
    expect(oil?.note).toBe("Review recommended"); // pass → fail downgrade

    const acc = c.rows.find((r) => r.fieldId === "accessories");
    expect(acc?.changed).toBe(true);
    expect(acc?.note).toBe("Review recommended");

    expect(c.condition.staffDamage).toBe(true);
    expect(c.followUps.length).toBeGreaterThan(0);
  });

  it("labels a confirmed renter damage report vs an unconfirmed one, with no blame language", () => {
    const renterDamaged = data(
      "return",
      { damage_observed: "yes" },
      { damage_observed: "yes", accessories_missing: false }
    );
    const staffConfirms = data(
      "return",
      { damage_observed: "yes" },
      { damage_observed: "yes", accessories_missing: false }
    );
    const staffDenies = data(
      "return",
      { damage_observed: "no" },
      { damage_observed: "no", accessories_missing: false }
    );

    const confirmed = buildSessionComparison({
      outbound: null,
      staff: staffConfirms,
      renterReports: [{ submission_data_json: renterDamaged }],
    });
    expect(confirmed.condition.note).toBe("Staff confirmed damage");

    const discrepancy = buildSessionComparison({
      outbound: null,
      staff: staffDenies,
      renterReports: [{ submission_data_json: renterDamaged }],
    });
    expect(discrepancy.condition.note).toBe("Staff did not confirm reported damage");

    // Never assign fault / causation / billing.
    const blob = JSON.stringify([confirmed, discrepancy]);
    expect(blob).not.toMatch(/caused|charge|blame|liable|fault|proven/i);
  });

  it("renter-only report (no staff yet) reads as reported, not confirmed", () => {
    const renterDamaged = data(
      "return",
      { damage_observed: "yes" },
      { damage_observed: "yes", accessories_missing: false }
    );
    const c = buildSessionComparison({
      outbound: null,
      staff: null,
      renterReports: [{ submission_data_json: renterDamaged }],
    });
    expect(c.condition.note).toBe("Renter reported damage");
    expect(c.rows).toHaveLength(0); // no baseline + no staff → nothing fabricated
  });

  it("falls back with no rows when the outbound baseline is absent", () => {
    const staff = data(
      "return",
      { engine_hours: 10 },
      { damage_observed: "no", accessories_missing: false }
    );
    const c = buildSessionComparison({ outbound: null, staff, renterReports: [] });
    expect(c.hasOutbound).toBe(false);
    expect(c.rows).toHaveLength(0);
  });
});

describe("photoSlotsBySource", () => {
  it("groups photos by source then slot", () => {
    const outbound = data(
      "outbound",
      {},
      { damage_observed: "no", accessories_missing: false },
      { overall_photo: [{ path: "o.jpg", caption: "x" }] }
    );
    const staff = data(
      "return",
      {},
      { damage_observed: "no", accessories_missing: false },
      { overall_photo: [{ path: "s.jpg", caption: "x" }] }
    );
    const groups = photoSlotsBySource({ outbound, staff, renterReports: [] });
    expect(groups.map((g) => g.source)).toEqual(["outbound", "staff"]);
    expect(groups[0].paths).toEqual(["o.jpg"]);
    expect(groups[1].label).toBe("Overall photo");
  });
});
