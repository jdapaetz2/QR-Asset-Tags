import { describe, expect, it } from "vitest";

import { readLegacyUrgency, readTriage } from "./triage";

describe("readTriage", () => {
  it("returns null for rows written before the triage questions existed", () => {
    expect(readTriage({ urgency: "high", description: "x" })).toBeNull();
    expect(readTriage({ triage_version: 2, equipment_state: "unsafe" })).toBeNull();
    expect(readTriage({ triage_version: "1", equipment_state: "unsafe" })).toBeNull();
    expect(readTriage(null)).toBeNull();
    expect(readTriage(["triage_version", 1])).toBeNull();
  });

  it("reads each field only when it is a known value", () => {
    expect(
      readTriage({
        triage_version: 1,
        issue_type: "stuck_recovery",
        equipment_state: "cannot_be_moved",
        response_need: "immediate",
        damage_severity: "major",
      })
    ).toEqual({
      issueType: "stuck_recovery",
      equipmentState: "cannot_be_moved",
      responseNeed: "immediate",
      damageSeverity: "major",
    });
  });

  it("treats unknown or malformed values as not reported", () => {
    expect(
      readTriage({ triage_version: 1, equipment_state: "on fire", response_need: 3, damage_severity: "SEVERE" })
    ).toEqual({ issueType: null, equipmentState: null, responseNeed: null, damageSeverity: null });
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
