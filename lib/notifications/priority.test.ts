import { describe, expect, it } from "vitest";

import {
  DAMAGE_SEVERITIES,
  EQUIPMENT_STATES,
  ISSUE_TYPES,
  RESPONSE_NEEDS,
  type ReportedTriage,
} from "@/lib/submissions/triage";
import type { ReturnChecklistSummary } from "./return-summary";
import {
  priorityForReport,
  reportPriority,
  reportedValuesFor,
  returnPriority,
  shouldShowPriorityReason,
  submissionPriority,
  type NotificationPriority,
  type PriorityBasis,
} from "./priority";

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
    slotPathEntries: [],
    ...overrides,
  };
}

describe("damage and support reports — the design §5.5 table", () => {
  it.each([
    ["damage_report", triage({ equipmentState: "operating", responseNeed: "routine", damageSeverity: "minor" }), null, "routine", "damage reported", "default", null],
    ["damage_report", triage({ equipmentState: "unsafe_to_operate", responseNeed: "immediate" }), null, "immediate", "reported unsafe to operate", "equipment_state", "Reported unsafe to operate"],
    ["damage_report", triage({ equipmentState: "unsafe_to_operate" }), null, "immediate", "reported unsafe to operate", "equipment_state", "Reported unsafe to operate"],
    ["damage_report", triage({ responseNeed: "immediate" }), null, "immediate", "help requested now", "response_need", "Help needed now"],
    ["damage_report", triage({ equipmentState: "cannot_be_moved" }), null, "immediate", "reported unable to move", "equipment_state", "Reported unable to move"],
    ["damage_report", triage({ equipmentState: "not_operating", responseNeed: "prompt" }), null, "follow_up", "reported not operating", "equipment_state", "Reported not operating"],
    ["damage_report", triage({ equipmentState: "operating_with_limitations" }), null, "follow_up", "reported operating with limitations", "equipment_state", "Reported operating with limitations"],
    ["damage_report", triage({ responseNeed: "prompt" }), null, "follow_up", "follow-up requested", "response_need", "Follow up soon"],
    ["damage_report", triage({ damageSeverity: "major" }), null, "routine", "damage reported", "default", null],
    ["damage_report", triage({}), null, "routine", "damage reported", "default", null],
    ["damage_report", null, "medium", "routine", "damage reported", "default", null],
    ["damage_report", null, "low", "routine", "damage reported", "default", null],
    ["damage_report", null, null, "routine", "damage reported", "default", null],
    ["damage_report", null, "high", "follow_up", "reported urgency: high", "legacy_urgency", "Reported urgency: high"],
    ["support_request", triage({ issueType: "breakdown_no_start" }), null, "follow_up", "reported breakdown or no-start", "issue_type", "Breakdown or no-start reported"],
    ["support_request", triage({ issueType: "stuck_recovery", responseNeed: "immediate" }), null, "immediate", "help requested now", "response_need", "Help needed now"],
    ["support_request", triage({ issueType: "stuck_recovery" }), null, "follow_up", "reported stuck, recovery needed", "issue_type", "Recovery assistance reported"],
    ["support_request", triage({ issueType: "rollover_safety", responseNeed: "routine" }), null, "immediate", "reported rollover or safety incident", "issue_type", "Rollover or safety incident reported"],
    ["support_request", triage({ issueType: "operating_question", responseNeed: "routine" }), null, "routine", "support request", "default", null],
    ["support_request", null, null, "routine", "support request", "default", null],
  ] as const)("%s %j urgency=%s → %s", (formType, t, urgency, priority, headline, basis, reason) => {
    expect(reportPriority({ formType, triage: t, legacyUrgency: urgency })).toEqual({ priority, headline, basis, reason });
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
  });
});

describe("invariants", () => {
  it("a damage or support report is never record only, across every answer combination", () => {
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

  it("not_sure never raises priority", () => {
    expect(
      reportPriority({
        formType: "damage_report",
        triage: triage({ equipmentState: "not_sure", responseNeed: "not_sure", damageSeverity: "not_sure" }),
        legacyUrgency: null,
      }).priority
    ).toBe("routine");
    expect(
      reportPriority({
        formType: "support_request",
        triage: triage({ issueType: "not_sure", responseNeed: "not_sure" }),
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

describe("priority reason (D5.1, presentation only)", () => {
  /**
   * Frozen: each reason names exactly one D1/D2 rule, with that rule's priority and headline. D5.1 added the reason
   * without changing any priority or headline; this table fails if a later change moves one.
   */
  const RULES: Record<string, { priority: NotificationPriority; headline: string; basis: PriorityBasis; shown: boolean }> = {
    "Rollover or safety incident reported": { priority: "immediate", headline: "reported rollover or safety incident", basis: "issue_type", shown: true },
    "Reported unsafe to operate": { priority: "immediate", headline: "reported unsafe to operate", basis: "equipment_state", shown: true },
    "Reported unable to move": { priority: "immediate", headline: "reported unable to move", basis: "equipment_state", shown: true },
    "Help needed now": { priority: "immediate", headline: "help requested now", basis: "response_need", shown: false },
    "Reported not operating": { priority: "follow_up", headline: "reported not operating", basis: "equipment_state", shown: true },
    "Breakdown or no-start reported": { priority: "follow_up", headline: "reported breakdown or no-start", basis: "issue_type", shown: true },
    "Recovery assistance reported": { priority: "follow_up", headline: "reported stuck, recovery needed", basis: "issue_type", shown: true },
    "Reported operating with limitations": { priority: "follow_up", headline: "reported operating with limitations", basis: "equipment_state", shown: true },
    "Follow up soon": { priority: "follow_up", headline: "follow-up requested", basis: "response_need", shown: false },
  };

  it("every answer combination maps to one frozen rule, and the reason is shown only for a reported condition", () => {
    for (const formType of ["damage_report", "support_request"] as const) {
      for (const issueType of [null, ...ISSUE_TYPES]) {
        for (const equipmentState of [null, ...EQUIPMENT_STATES]) {
          for (const responseNeed of [null, ...RESPONSE_NEEDS]) {
            const decision = reportPriority({
              formType,
              triage: triage({ issueType, equipmentState, responseNeed }),
              legacyUrgency: null,
            });
            if (decision.reason === null) {
              expect(decision).toEqual({
                priority: "routine",
                headline: formType === "support_request" ? "support request" : "damage reported",
                basis: "default",
                reason: null,
              });
              expect(shouldShowPriorityReason(decision)).toBe(false);
              continue;
            }
            const rule = RULES[decision.reason];
            expect(rule, decision.reason).toBeDefined();
            expect({ priority: decision.priority, headline: decision.headline, basis: decision.basis }).toEqual({
              priority: rule.priority,
              headline: rule.headline,
              basis: rule.basis,
            });
            expect(shouldShowPriorityReason(decision)).toBe(rule.shown);
          }
        }
      }
    }
  });

  it.each([
    ["immediate", "equipment_state", "Reported unsafe to operate", true],
    ["immediate", "issue_type", "Rollover or safety incident reported", true],
    ["immediate", "response_need", "Help needed now", false],
    ["follow_up", "legacy_urgency", "Reported urgency: high", true],
    ["follow_up", "response_need", "Follow up soon", false],
    ["follow_up", "return_exceptions", null, false],
    ["routine", "equipment_state", "Reported operating", false],
    ["routine", "default", null, false],
    ["record", "clean_return", null, false],
  ] as const)("%s by %s (%s) → shown %s", (priority, basis, reason, shown) => {
    expect(shouldShowPriorityReason({ priority, basis, reason })).toBe(shown);
  });

  it("an escalated report keeps the submitter's own response need out of the reason", () => {
    const decision = reportPriority({
      formType: "damage_report",
      triage: triage({ equipmentState: "unsafe_to_operate", responseNeed: "prompt" }),
      legacyUrgency: null,
    });
    expect(decision).toMatchObject({ priority: "immediate", basis: "equipment_state", reason: "Reported unsafe to operate" });
    expect(shouldShowPriorityReason(decision)).toBe(true);
  });
});

describe("reading stored reports", () => {
  it("carries only the questions each form asks", () => {
    const data = {
      triage_version: 1,
      reported_issue_type: "rollover_safety",
      reported_equipment_state: "unsafe_to_operate",
      reported_response_need: "prompt",
      reported_damage_severity: "major",
    };
    expect(reportedValuesFor("damage_report", data)).toMatchObject({
      triageRecorded: true,
      issueType: null,
      equipmentState: "unsafe_to_operate",
      damageSeverity: "major",
    });
    expect(reportedValuesFor("support_request", data)).toMatchObject({
      issueType: "rollover_safety",
      equipmentState: null,
      damageSeverity: null,
    });
  });

  it("reads legacy urgency only without triage", () => {
    expect(reportedValuesFor("damage_report", { urgency: "high" })).toMatchObject({
      triageRecorded: false,
      legacyUrgency: "high",
    });
    expect(priorityForReport("damage_report", { urgency: "high" }).priority).toBe("follow_up");
    expect(priorityForReport("damage_report", { triage_version: 1, urgency: "high" }).priority).toBe("routine");
  });
});

describe("submissionPriority — the admin UI's single source", () => {
  it("covers damage, support and return checklists, and nothing else", () => {
    expect(
      submissionPriority({
        form_type: "damage_report",
        submission_data_json: { triage_version: 1, reported_equipment_state: "cannot_be_moved" },
      })?.priority
    ).toBe("immediate");
    expect(
      submissionPriority({ form_type: "support_request", submission_data_json: { description: "x" } })?.priority
    ).toBe("routine");
    expect(
      submissionPriority({
        form_type: "return_checklist",
        submission_origin: "staff",
        submission_data_json: { damage_observed: "yes" },
      })
    ).toEqual({
      priority: "follow_up",
      headline: "staff return checklist, 1 exception",
      basis: "return_exceptions",
      reason: null,
    });
    expect(submissionPriority({ form_type: "pre_use_inspection", submission_data_json: {} })).toBeNull();
  });
});

describe("return checklists", () => {
  it("a clean return is record only", () => {
    expect(returnPriority(summary(), "Renter return checklist")).toEqual({
      priority: "record",
      headline: "renter return checklist, no exceptions",
      basis: "clean_return",
      reason: null,
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
    expect(decision.headline).toBe(`renter return checklist, ${count} ${count === 1 ? "exception" : "exceptions"}`);
    expect(decision).toMatchObject({ basis: "return_exceptions", reason: null });
  });

  it.each([
    [{ conditionPhotosMissing: true }],
    [{ missingRecommendedPhotos: true }],
    [{ failedOptional: ["Cleaned inside cab?"] }],
  ])("photo gaps or failed optional checks only %j → routine", (overrides) => {
    expect(returnPriority(summary(overrides), "Renter return checklist")).toEqual({
      priority: "routine",
      headline: "renter return checklist, review when convenient",
      basis: "return_notes",
      reason: null,
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
