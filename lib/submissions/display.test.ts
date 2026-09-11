import { describe, expect, it } from "vitest";

import {
  formTypeLabel,
  isSubmissionStatus,
  submissionFields,
} from "./display";

describe("isSubmissionStatus", () => {
  it("accepts the allow-list and rejects others", () => {
    expect(isSubmissionStatus("reviewed")).toBe(true);
    expect(isSubmissionStatus("archived")).toBe(true);
    expect(isSubmissionStatus("deleted")).toBe(false);
    expect(isSubmissionStatus(null)).toBe(false);
  });
});

describe("formTypeLabel", () => {
  it("labels known types and humanizes unknown", () => {
    expect(formTypeLabel("damage_report")).toBe("Damage report");
    expect(formTypeLabel("pre_use_inspection")).toBe("Pre-use inspection");
    expect(formTypeLabel("mystery_form")).toBe("Mystery form");
  });
});

describe("submissionFields", () => {
  it("shows only what a legacy damage report stored", () => {
    expect(submissionFields("damage_report", { description: "Bent arm" })).toEqual([
      { label: "Description", value: "Bent arm" },
    ]);
  });

  it("labels a legacy urgency as reported urgency, never as severity", () => {
    expect(submissionFields("damage_report", { urgency: "high", description: "Bent arm" })).toEqual([
      { label: "Reported urgency", value: "High" },
      { label: "Description", value: "Bent arm" },
    ]);
  });

  it("renders D2 damage answers with reported labels, not-reported and not-sure values", () => {
    expect(
      submissionFields("damage_report", {
        triage_version: 1,
        reported_equipment_state: "unsafe_to_operate",
        reported_response_need: null,
        reported_damage_severity: "not_sure",
        description: "Tipped over",
      })
    ).toEqual([
      { label: "Reported equipment state", value: "Unsafe to operate" },
      { label: "Reported response need", value: "Not reported" },
      { label: "Reported damage severity", value: "Not sure" },
      { label: "Description", value: "Tipped over" },
    ]);
  });

  it("renders D2 support answers in order and hides the version marker", () => {
    const fields = submissionFields("support_request", {
      triage_version: 1,
      reported_issue_type: "stuck_recovery",
      reported_response_need: "immediate",
      preferred_contact_method: "text",
      description: "Sunk in mud",
    });
    expect(fields).toEqual([
      { label: "Reported issue type", value: "Stuck or needs recovery" },
      { label: "Reported response need", value: "Help needed now" },
      { label: "Preferred contact", value: "text" },
      { label: "Description", value: "Sunk in mud" },
    ]);
    expect(fields.some((field) => /triage/i.test(field.label))).toBe(false);
  });

  it("never shows triage keys on a row whose form did not ask them", () => {
    expect(
      submissionFields("damage_report", { reported_equipment_state: "unsafe_to_operate", description: "x" }).map(
        (field) => field.label
      )
    ).toEqual(["Description"]);
  });

  it("renders return checklist fields in order", () => {
    const fields = submissionFields("return_checklist", {
      cleaned: "yes",
      accessories_returned: "no",
      damage_observed: "no",
      fuel_or_charge_level: "Full",
      condition_notes: "Fine",
    });
    expect(fields.map((f) => f.label)).toEqual([
      "Condition notes",
      "Fuel / charge level",
      "Cleaned",
      "Accessories returned",
      "Damage observed",
    ]);
  });

  it("falls back to humanized labels for unknown keys / form types", () => {
    const fields = submissionFields("unknown_form", { some_extra_field: "x" });
    expect(fields).toContainEqual({ label: "Some extra field", value: "x" });
  });
});
