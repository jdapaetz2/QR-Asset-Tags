import { describe, expect, it } from "vitest";

import {
  formTypeTone,
  normalizeOrigin,
  oppositeOrigin,
  submissionSourceBadge,
  submissionTypeLabel,
} from "./origin";

describe("formTypeTone", () => {
  it("maps each form type to a distinct tone; unknown → neutral", () => {
    expect(formTypeTone("damage_report")).toBe("danger");
    expect(formTypeTone("support_request")).toBe("info");
    expect(formTypeTone("return_checklist")).toBe("success");
    expect(formTypeTone("pre_use_inspection")).toBe("neutral");
    expect(formTypeTone("mystery")).toBe("neutral");
  });
});

describe("normalizeOrigin / oppositeOrigin", () => {
  it("treats only 'staff' as staff; everything else is public", () => {
    expect(normalizeOrigin("staff")).toBe("staff");
    expect(normalizeOrigin("public")).toBe("public");
    expect(normalizeOrigin(null)).toBe("public");
    expect(normalizeOrigin(undefined)).toBe("public");
    expect(normalizeOrigin("weird")).toBe("public");
  });

  it("oppositeOrigin flips", () => {
    expect(oppositeOrigin("staff")).toBe("public");
    expect(oppositeOrigin("public")).toBe("staff");
  });
});

describe("submissionTypeLabel", () => {
  it("distinguishes renter vs staff returns and the outbound baseline", () => {
    expect(submissionTypeLabel("return_checklist", "public")).toBe("Renter return checklist");
    expect(submissionTypeLabel("return_checklist", "staff")).toBe("Staff return checklist");
    expect(submissionTypeLabel("return_checklist", null)).toBe("Renter return checklist");
    expect(submissionTypeLabel("pre_use_inspection", "staff")).toBe("Outbound inspection");
    // Outbound is always staff — even an odd origin value reads as outbound.
    expect(submissionTypeLabel("pre_use_inspection", "public")).toBe("Outbound inspection");
  });

  it("falls back to the plain label for other form types", () => {
    expect(submissionTypeLabel("damage_report", "public")).toBe("Damage report");
    expect(submissionTypeLabel("support_request", "public")).toBe("Support request");
  });
});

describe("submissionSourceBadge", () => {
  it("labels return/outbound records Renter or Staff", () => {
    expect(submissionSourceBadge("return_checklist", "public")).toEqual({
      label: "Renter",
      tone: "neutral",
    });
    expect(submissionSourceBadge("return_checklist", "staff")).toEqual({
      label: "Staff",
      tone: "info",
    });
    expect(submissionSourceBadge("pre_use_inspection", "staff")).toEqual({
      label: "Staff",
      tone: "info",
    });
  });

  it("returns null for damage/support (no new information)", () => {
    expect(submissionSourceBadge("damage_report", "public")).toBeNull();
    expect(submissionSourceBadge("support_request", "public")).toBeNull();
  });
});
