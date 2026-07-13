import { describe, expect, it } from "vitest";

import {
  damageSeverityLabel,
  isOpenDamageRow,
  openDamageHref,
  openDamageSummaryByAsset,
  type OpenDamageRow,
} from "./damage";

const v2Return = (damage: boolean, severity?: string) => ({
  schema_version: 2,
  flags: { damage_observed: damage ? "yes" : "no", accessories_missing: false },
  answers: { values: severity ? { damage_severity: severity } : {}, photos: {} },
});

describe("isOpenDamageRow", () => {
  it("counts an unresolved public damage report", () => {
    expect(
      isOpenDamageRow({ form_type: "damage_report", status: "new", submission_data_json: {} })
    ).toBe(true);
    expect(
      isOpenDamageRow({ form_type: "damage_report", status: "reviewed", submission_data_json: {} })
    ).toBe(true);
  });

  it("counts V1, V2, and staff damaged returns", () => {
    // V1 flat.
    expect(
      isOpenDamageRow({
        form_type: "return_checklist",
        status: "new",
        submission_data_json: { damage_observed: "yes" },
      })
    ).toBe(true);
    // V2 (renter or staff — both are return_checklist).
    expect(
      isOpenDamageRow({
        form_type: "return_checklist",
        status: "reviewed",
        submission_data_json: v2Return(true),
      })
    ).toBe(true);
  });

  it("does not count an undamaged return", () => {
    expect(
      isOpenDamageRow({
        form_type: "return_checklist",
        status: "new",
        submission_data_json: v2Return(false),
      })
    ).toBe(false);
  });

  it("excludes resolved/archived, the outbound baseline, and support requests", () => {
    expect(
      isOpenDamageRow({ form_type: "damage_report", status: "resolved", submission_data_json: {} })
    ).toBe(false);
    expect(
      isOpenDamageRow({ form_type: "damage_report", status: "archived", submission_data_json: {} })
    ).toBe(false);
    // Outbound baseline that happens to record existing damage is NOT an open damage event.
    expect(
      isOpenDamageRow({
        form_type: "pre_use_inspection",
        status: "new",
        submission_data_json: v2Return(true),
      })
    ).toBe(false);
    expect(
      isOpenDamageRow({ form_type: "support_request", status: "new", submission_data_json: {} })
    ).toBe(false);
  });
});

describe("damageSeverityLabel", () => {
  it("reads V2 return severity and damage-report urgency", () => {
    expect(
      damageSeverityLabel({ form_type: "return_checklist", submission_data_json: v2Return(true, "moderate") })
    ).toBe("Moderate");
    expect(
      damageSeverityLabel({ form_type: "damage_report", submission_data_json: { urgency: "high" } })
    ).toBe("High");
    expect(
      damageSeverityLabel({ form_type: "return_checklist", submission_data_json: { damage_observed: "yes" } })
    ).toBeNull();
  });
});

describe("openDamageSummaryByAsset", () => {
  const rows: OpenDamageRow[] = [
    {
      id: "d1",
      asset_id: "a",
      created_at: "2026-05-01T00:00:00Z",
      form_type: "damage_report",
      submission_origin: "public",
      status: "new",
      submission_data_json: { urgency: "low" },
    },
    {
      id: "d2",
      asset_id: "a",
      created_at: "2026-05-03T00:00:00Z",
      form_type: "return_checklist",
      submission_origin: "staff",
      status: "new",
      submission_data_json: v2Return(true, "severe"),
    },
    {
      id: "r1",
      asset_id: "a",
      created_at: "2026-05-02T00:00:00Z",
      form_type: "return_checklist",
      submission_origin: "public",
      status: "new",
      submission_data_json: v2Return(false), // not damage → ignored
    },
    {
      id: "d3",
      asset_id: "b",
      created_at: "2026-05-01T00:00:00Z",
      form_type: "damage_report",
      submission_origin: "public",
      status: "reviewed",
      submission_data_json: {},
    },
  ];

  it("groups by asset with count + newest latest, skipping non-damage rows", () => {
    const map = openDamageSummaryByAsset(rows);
    expect(map.get("a")?.count).toBe(2); // d1 + d2 (r1 ignored)
    expect(map.get("a")?.latest.id).toBe("d2"); // newest
    expect(map.get("a")?.latest.origin).toBe("staff");
    expect(map.get("a")?.latest.severity).toBe("Severe");
    expect(map.get("b")?.count).toBe(1);
  });

  it("has no entry for an asset once all its damage is resolved", () => {
    const resolved = rows.map((r) => ({ ...r, status: "resolved" }));
    expect(openDamageSummaryByAsset(resolved).size).toBe(0);
  });
});

describe("openDamageHref", () => {
  it("links to the filtered unresolved-damage submissions view", () => {
    expect(openDamageHref("asset-1")).toBe(
      "/dashboard/submissions?attention=damage&asset_id=asset-1&status=unresolved"
    );
  });
});
