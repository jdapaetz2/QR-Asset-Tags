import { describe, expect, it } from "vitest";

import {
  activeQuickFilterKey,
  hasMedia,
  mediaCount,
  parseSubmissionFilters,
  submissionFilterQuery,
  submissionReference,
  submissionUrgency,
  urgencyTone,
} from "./inbox";

describe("submissionReference", () => {
  it("builds SUB-YEAR-HEX from created_at year and id prefix", () => {
    expect(
      submissionReference("a1b2c3d4-0000-0000-0000-000000000000", "2026-03-14T10:00:00Z")
    ).toBe("SUB-2026-A1B2C3");
  });

  it("uses 0000 year for an unparseable date", () => {
    expect(submissionReference("abcdef00", "not-a-date")).toBe("SUB-0000-ABCDEF");
  });

  it("pads short/empty ids to six chars", () => {
    expect(submissionReference("ab", "2026-01-01T00:00:00Z")).toBe("SUB-2026-AB0000");
    expect(submissionReference("", "2026-01-01T00:00:00Z")).toBe("SUB-2026-000000");
  });
});

describe("mediaCount / hasMedia", () => {
  it("counts array entries and treats non-arrays as empty", () => {
    expect(mediaCount(["a", "b", "c"])).toBe(3);
    expect(mediaCount([])).toBe(0);
    expect(mediaCount(null)).toBe(0);
    expect(mediaCount("x")).toBe(0);
    expect(hasMedia(["a"])).toBe(true);
    expect(hasMedia([])).toBe(false);
    expect(hasMedia(undefined)).toBe(false);
  });
});

describe("submissionUrgency / urgencyTone", () => {
  it("returns urgency only for damage reports", () => {
    expect(submissionUrgency("damage_report", { urgency: "high" })).toBe("high");
    expect(submissionUrgency("support_request", { urgency: "high" })).toBeNull();
    expect(submissionUrgency("damage_report", { urgency: "  " })).toBeNull();
    expect(submissionUrgency("damage_report", {})).toBeNull();
    expect(submissionUrgency("damage_report", null)).toBeNull();
  });

  it("maps urgency levels to tones", () => {
    expect(urgencyTone("high")).toBe("danger");
    expect(urgencyTone("medium")).toBe("warning");
    expect(urgencyTone("low")).toBe("neutral");
    expect(urgencyTone("weird")).toBe("neutral");
  });
});

describe("parseSubmissionFilters", () => {
  it("passes through valid filters", () => {
    expect(
      parseSubmissionFilters({
        form_type: "damage_report",
        status: "new",
        asset_id: "asset-1",
        media: "1",
        q: "  jane  ",
      })
    ).toEqual({
      formType: "damage_report",
      status: "new",
      assetId: "asset-1",
      hasMedia: true,
      q: "jane",
    });
  });

  it("drops unknown form types and statuses to empty (no URL injection)", () => {
    expect(
      parseSubmissionFilters({ form_type: "evil_form", status: "deleted" })
    ).toEqual({
      formType: "",
      status: "",
      assetId: "",
      hasMedia: false,
      q: "",
    });
  });

  it("handles array-valued params and missing keys", () => {
    expect(parseSubmissionFilters({ status: ["reviewed", "x"] }).status).toBe(
      "reviewed"
    );
    expect(parseSubmissionFilters({}).hasMedia).toBe(false);
  });
});

describe("submissionFilterQuery", () => {
  it("serializes only set filters", () => {
    expect(
      submissionFilterQuery({ formType: "support_request", hasMedia: true })
    ).toBe("form_type=support_request&media=1");
    expect(submissionFilterQuery({})).toBe("");
  });
});

describe("activeQuickFilterKey", () => {
  const base = {
    formType: "" as const,
    status: "" as const,
    assetId: "",
    hasMedia: false,
    q: "",
  };

  it("matches All when nothing is set", () => {
    expect(activeQuickFilterKey(base)).toBe("all");
  });

  it("matches the New and type chips", () => {
    expect(activeQuickFilterKey({ ...base, status: "new" })).toBe("new");
    expect(
      activeQuickFilterKey({ ...base, formType: "damage_report" })
    ).toBe("damage");
    expect(activeQuickFilterKey({ ...base, hasMedia: true })).toBe("media");
  });

  it("returns null for combinations no single chip represents", () => {
    expect(
      activeQuickFilterKey({ ...base, status: "new", formType: "damage_report" })
    ).toBeNull();
    expect(activeQuickFilterKey({ ...base, q: "jane" })).toBeNull();
  });
});
