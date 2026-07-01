import { describe, expect, it } from "vitest";

import {
  activeQuickFilterKey,
  firstImagePath,
  hasMedia,
  isImagePath,
  matchesSearch,
  mediaCount,
  parseSubmissionFilters,
  resolveStatusFilter,
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

  it("matches the New, type, and Archived chips", () => {
    expect(activeQuickFilterKey({ ...base, status: "new" })).toBe("new");
    expect(
      activeQuickFilterKey({ ...base, formType: "damage_report" })
    ).toBe("damage");
    expect(activeQuickFilterKey({ ...base, hasMedia: true })).toBe("media");
    expect(activeQuickFilterKey({ ...base, status: "archived" })).toBe(
      "archived"
    );
  });

  it("returns null for combinations no single chip represents", () => {
    expect(
      activeQuickFilterKey({ ...base, status: "new", formType: "damage_report" })
    ).toBeNull();
    expect(activeQuickFilterKey({ ...base, q: "jane" })).toBeNull();
  });
});

describe("resolveStatusFilter", () => {
  it("defaults to active statuses (archived hidden) when no status is set", () => {
    const f = resolveStatusFilter("");
    expect(f).toEqual({
      mode: "active",
      statuses: ["new", "reviewed", "resolved"],
    });
    expect(f.mode === "active" && f.statuses).not.toContain("archived");
  });

  it("returns archived-only when archived is selected", () => {
    expect(resolveStatusFilter("archived")).toEqual({
      mode: "single",
      status: "archived",
    });
  });

  it("returns the single status for other explicit statuses", () => {
    expect(resolveStatusFilter("new")).toEqual({ mode: "single", status: "new" });
    expect(resolveStatusFilter("reviewed")).toEqual({
      mode: "single",
      status: "reviewed",
    });
    expect(resolveStatusFilter("resolved")).toEqual({
      mode: "single",
      status: "resolved",
    });
  });
});

describe("isImagePath / firstImagePath", () => {
  it("detects image extensions and rejects others", () => {
    expect(isImagePath("org/1/a/b/sub/uuid.jpg")).toBe(true);
    expect(isImagePath("uuid.PNG")).toBe(true);
    expect(isImagePath("uuid.webp")).toBe(true);
    expect(isImagePath("uuid.bin")).toBe(false);
    expect(isImagePath("uuid.pdf")).toBe(false);
    expect(isImagePath(null)).toBe(false);
    expect(isImagePath(123)).toBe(false);
  });

  it("returns the first image path or null", () => {
    expect(firstImagePath(["a.bin", "b.png", "c.jpg"])).toBe("b.png");
    expect(firstImagePath(["a.bin", "b.pdf"])).toBeNull();
    expect(firstImagePath([])).toBeNull();
    expect(firstImagePath(null)).toBeNull();
  });
});

describe("matchesSearch", () => {
  const row = {
    id: "a1b2c3d4-0000-0000-0000-000000000000",
    created_at: "2026-03-14T10:00:00Z",
    submitted_by_name: "Jane Operator",
    submitted_by_email: "jane@example.com",
    submitted_by_phone: null,
    asset: { asset_code: "EX-017", asset_name: "Scissor Lift" },
  };

  it("matches empty query", () => {
    expect(matchesSearch(row, "")).toBe(true);
    expect(matchesSearch(row, "   ")).toBe(true);
  });

  it("matches submitter, asset, and reference (case-insensitive)", () => {
    expect(matchesSearch(row, "jane")).toBe(true);
    expect(matchesSearch(row, "EXAMPLE.COM")).toBe(true);
    expect(matchesSearch(row, "ex-017")).toBe(true);
    expect(matchesSearch(row, "scissor")).toBe(true);
    expect(matchesSearch(row, "SUB-2026-A1B2C3")).toBe(true);
    expect(matchesSearch(row, "a1b2c3")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(matchesSearch(row, "forklift")).toBe(false);
  });

  it("is safe when contact fields are null", () => {
    const bare = { ...row, submitted_by_name: null, submitted_by_email: null };
    expect(matchesSearch(bare, "scissor")).toBe(true);
    expect(matchesSearch(bare, "jane")).toBe(false);
  });
});
