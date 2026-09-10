import { describe, expect, it } from "vitest";

import {
  DAMAGE_SEVERITIES,
  EQUIPMENT_STATES,
  ISSUE_TYPES,
  RESPONSE_NEEDS,
  type ReportedTriage,
} from "@/lib/submissions/triage";
import type { ReturnChecklistSummary } from "./return-summary";
import { reportPriority, returnPriority } from "./priority";

function triage(overrides: Partial<ReportedTriage>): ReportedTriage {
  return { issueType: null, equipmentState: null, responseNeed: null, damageSeverity: null, ...overrides };
}

function summary(overrides: Partial<ReturnChecklistSummary> = {}): ReturnChecklistSummary {
  return {
    shape: "v2",
    damage: false,
    damageLocation: null,
    damageSeverityLabel: null,
    damageDescription: null,
    failedRequired: [],
    failedOptional: [],
    notOperating: [],
    accessoriesMissing: false,
    missingAccessoryLabels: [],
    damagePhotosMissing: false,
    conditionPhotosMissing: false,
    missingRecommendedPhotos: false,
    missingRecommendedSlotLabels: [],
    slotCounts: [],
    slotPaths: [],
    ...overrides,
  };
}

describe("damage and support reports — the design §5.5 table", () => {
  it.each([
    ["damage_report", triage({ equipmentState: "operating", responseNeed: "routine" }), null, "routine", "damage reported"],
    ["damage_report", triage({ equipmentState: "unsafe" }), null, "immediate", "reported unsafe to operate"],
    ["damage_report", triage({ responseNeed: "immediate" }), null, "immediate", "help requested now"],
    ["damage_report", triage({ equipmentState: "cannot_be_moved" }), null, "immediate", "reported unable to move"],
    ["damage_report", triage({ equipmentState: "not_operating" }), null, "follow_up", "reported not operating"],
    ["damage_report", triage({ equipmentState: "operating_limited" }), null, "follow_up", "reported operating with limitations"],
    ["damage_report", triage({ responseNeed: "prompt" }), null, "follow_up", "follow-up requested"],
    ["damage_report", triage({ damageSeverity: "major", equipmentState: "operating", responseNeed: "routine" }), null, "routine", "damage reported"],
    ["damage_report", triage({ damageSeverity: "major" }), null, "routine", "damage reported"],
    ["damage_report", triage({}), null, "routine", "damage reported"],
    ["damage_report", null, "medium", "routine", "damage reported"],
    ["damage_report", null, "low", "routine", "damage reported"],
    ["damage_report", null, null, "routine", "damage reported"],
    ["damage_report", null, "high", "follow_up", "reported urgency: high"],
    ["support_request", triage({ issueType: "stuck_recovery", responseNeed: "immediate" }), null, "immediate", "help requested now"],
    ["support_request", triage({ issueType: "stuck_recovery" }), null, "follow_up", "reported stuck, recovery needed"],
    ["support_request", triage({ issueType: "breakdown_no_start" }), null, "follow_up", "reported breakdown or no-start"],
    ["support_request", triage({ issueType: "rollover_safety", responseNeed: "routine" }), null, "immediate", "reported rollover or safety incident"],
    ["support_request", triage({ issueType: "operating_question", responseNeed: "routine" }), null, "routine", "support request"],
    ["support_request", null, null, "routine", "support request"],
  ] as const)("%s %j urgency=%s → %s", (formType, t, urgency, priority, headline) => {
    expect(reportPriority({ formType, triage: t, legacyUrgency: urgency })).toEqual({ priority, headline });
  });

  it("ignores legacy urgency once a row carries triage, even 'high'", () => {
    expect(
      reportPriority({
        formType: "damage_report",
        triage: triage({ equipmentState: "operating", responseNeed: "routine" }),
        legacyUrgency: "high",
      }).priority
    ).toBe("routine");
  });

  it("orders immediate conditions by the design headline table", () => {
    expect(
      reportPriority({
        formType: "support_request",
        triage: triage({ issueType: "rollover_safety", responseNeed: "immediate" }),
        legacyUrgency: null,
      }).headline
    ).toBe("reported rollover or safety incident");
    expect(
      reportPriority({
        formType: "damage_report",
        triage: triage({ equipmentState: "unsafe", responseNeed: "immediate" }),
        legacyUrgency: null,
      }).headline
    ).toBe("reported unsafe to operate");
  });
});

describe("invariants", () => {
  it("a damage or support report is never record only, across every triage combination", () => {
    for (const formType of ["damage_report", "support_request"] as const) {
      for (const issueType of [null, ...ISSUE_TYPES]) {
        for (const equipmentState of [null, ...EQUIPMENT_STATES]) {
          for (const responseNeed of [null, ...RESPONSE_NEEDS]) {
            const { priority } = reportPriority({
              formType,
              triage: triage({ issueType, equipmentState, responseNeed }),
              legacyUrgency: null,
            });
            expect(priority).not.toBe("record");
          }
        }
      }
    }
  });

  it("unknown answers never raise priority", () => {
    expect(
      reportPriority({
        formType: "damage_report",
        triage: triage({ equipmentState: "unknown", responseNeed: "unknown", damageSeverity: "unknown" }),
        legacyUrgency: null,
      }).priority
    ).toBe("routine");
    expect(
      reportPriority({
        formType: "support_request",
        triage: triage({ issueType: "unknown", responseNeed: "unknown" }),
        legacyUrgency: null,
      }).priority
    ).toBe("routine");
  });

  it("reported damage severity alone never raises priority", () => {
    for (const damageSeverity of DAMAGE_SEVERITIES) {
      expect(
        reportPriority({ formType: "damage_report", triage: triage({ damageSeverity }), legacyUrgency: null }).priority
      ).toBe("routine");
    }
  });

  it("issue type only applies to support requests", () => {
    expect(
      reportPriority({ formType: "damage_report", triage: triage({ issueType: "rollover_safety" }), legacyUrgency: null })
        .priority
    ).toBe("routine");
  });
});

describe("return checklists", () => {
  it("a clean return is record only", () => {
    expect(returnPriority(summary(), "Renter return checklist")).toEqual({
      priority: "record",
      headline: "renter return checklist, no exceptions",
    });
  });

  it.each([
    [{ damage: true }, 1],
    [{ failedRequired: ["Oil level"] }, 1],
    [{ notOperating: ["Starts / operates?"] }, 1],
    [{ accessoriesMissing: true }, 1],
    [{ damage: true, failedRequired: ["A", "B"], accessoriesMissing: true }, 4],
  ])("exceptions %j → follow up with %i", (overrides, count) => {
    const decision = returnPriority(summary(overrides), "Renter return checklist");
    expect(decision.priority).toBe("follow_up");
    expect(decision.headline).toBe(
      `renter return checklist, ${count} ${count === 1 ? "exception" : "exceptions"}`
    );
  });

  it.each([
    [{ conditionPhotosMissing: true }],
    [{ missingRecommendedPhotos: true }],
    [{ failedOptional: ["Cleaned inside cab?"] }],
  ])("photo gaps or failed optional checks only %j → routine", (overrides) => {
    expect(returnPriority(summary(overrides), "Renter return checklist")).toEqual({
      priority: "routine",
      headline: "renter return checklist, review when convenient",
    });
  });

  it("is never immediate, whatever it contains", () => {
    const worst = summary({
      damage: true,
      damageSeverityLabel: "Severe",
      failedRequired: ["A", "B", "C"],
      notOperating: ["Starts / operates?"],
      accessoriesMissing: true,
      damagePhotosMissing: true,
      conditionPhotosMissing: true,
    });
    expect(returnPriority(worst, "Renter return checklist").priority).toBe("follow_up");
  });
});
