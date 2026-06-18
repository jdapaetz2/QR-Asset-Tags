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
  it("orders known damage fields and formats missing as dash", () => {
    const fields = submissionFields("damage_report", { description: "Bent arm" });
    expect(fields).toEqual([
      { label: "Urgency", value: "—" },
      { label: "Description", value: "Bent arm" },
    ]);
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
