import { describe, expect, it } from "vitest";

import {
  DAMAGE_SEVERITIES,
  DAMAGE_SEVERITY_LABELS,
  DAMAGE_SEVERITY_OPTIONS,
  EQUIPMENT_STATES,
  EQUIPMENT_STATE_LABELS,
  EQUIPMENT_STATE_OPTIONS,
  ISSUE_TYPES,
  ISSUE_TYPE_LABELS,
  ISSUE_TYPE_OPTIONS,
  RESPONSE_NEEDS,
  RESPONSE_NEED_LABELS,
  RESPONSE_NEED_OPTIONS,
  TRIAGE_FIELDS,
  readLegacyUrgency,
  readTriage,
} from "./triage";

function expectComplete(
  values: readonly string[],
  labels: Record<string, string>,
  options: readonly { value: string; label: string }[]
) {
  expect(options.map((option) => option.value)).toEqual([...values]);
  for (const value of values) {
    expect(labels[value]).toBeTruthy();
    expect(options.find((option) => option.value === value)?.label).toBeTruthy();
  }
}

describe("the locked D2 contract", () => {
  it("uses the operator's field names", () => {
    expect(TRIAGE_FIELDS).toEqual({
      issueType: "reported_issue_type",
      equipmentState: "reported_equipment_state",
      responseNeed: "reported_response_need",
      damageSeverity: "reported_damage_severity",
    });
  });

  it("uses the operator's enum values exactly", () => {
    expect(EQUIPMENT_STATES).toEqual([
      "operating",
      "operating_with_limitations",
      "not_operating",
      "cannot_be_moved",
      "unsafe_to_operate",
      "not_sure",
    ]);
    expect(RESPONSE_NEEDS).toEqual(["routine", "prompt", "immediate", "not_sure"]);
    expect(DAMAGE_SEVERITIES).toEqual(["minor", "moderate", "major", "not_sure"]);
    expect(ISSUE_TYPES).toEqual([
      "operating_question",
      "breakdown_no_start",
      "stuck_recovery",
      "rollover_safety",
      "other",
      "not_sure",
    ]);
  });

  it("gives every value an admin label and a renter choice, in form order", () => {
    expectComplete(EQUIPMENT_STATES, EQUIPMENT_STATE_LABELS, EQUIPMENT_STATE_OPTIONS);
    expectComplete(RESPONSE_NEEDS, RESPONSE_NEED_LABELS, RESPONSE_NEED_OPTIONS);
    expectComplete(DAMAGE_SEVERITIES, DAMAGE_SEVERITY_LABELS, DAMAGE_SEVERITY_OPTIONS);
    expectComplete(ISSUE_TYPES, ISSUE_TYPE_LABELS, ISSUE_TYPE_OPTIONS);
  });
});

describe("readTriage", () => {
  it("returns null for rows written before the triage questions existed", () => {
    expect(readTriage({ urgency: "high", description: "x" })).toBeNull();
    expect(readTriage({ triage_version: 2, reported_equipment_state: "unsafe_to_operate" })).toBeNull();
    expect(readTriage({ triage_version: "1", reported_equipment_state: "unsafe_to_operate" })).toBeNull();
    expect(readTriage(null)).toBeNull();
    expect(readTriage(["triage_version", 1])).toBeNull();
  });

  it("reads each answer, including not_sure", () => {
    expect(
      readTriage({
        triage_version: 1,
        reported_issue_type: "stuck_recovery",
        reported_equipment_state: "cannot_be_moved",
        reported_response_need: "not_sure",
        reported_damage_severity: "major",
      })
    ).toEqual({
      issueType: "stuck_recovery",
      equipmentState: "cannot_be_moved",
      responseNeed: "not_sure",
      damageSeverity: "major",
    });
  });

  it("treats omitted, null and unknown values as not reported", () => {
    expect(
      readTriage({
        triage_version: 1,
        reported_equipment_state: "on fire",
        reported_response_need: 3,
        reported_damage_severity: null,
      })
    ).toEqual({ issueType: null, equipmentState: null, responseNeed: null, damageSeverity: null });
  });

  it("does not read D1's superseded key names", () => {
    expect(readTriage({ triage_version: 1, equipment_state: "unsafe", response_need: "immediate" })).toEqual({
      issueType: null,
      equipmentState: null,
      responseNeed: null,
      damageSeverity: null,
    });
  });
});

describe("readLegacyUrgency", () => {
  it("reads the three legacy levels", () => {
    expect(readLegacyUrgency({ urgency: "low" })).toBe("low");
    expect(readLegacyUrgency({ urgency: "medium" })).toBe("medium");
    expect(readLegacyUrgency({ urgency: " high " })).toBe("high");
  });

  it("ignores anything else", () => {
    expect(readLegacyUrgency({ urgency: "HIGH" })).toBeNull();
    expect(readLegacyUrgency({ urgency: "critical" })).toBeNull();
    expect(readLegacyUrgency({ urgency: null })).toBeNull();
    expect(readLegacyUrgency({})).toBeNull();
  });
});
