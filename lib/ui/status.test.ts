import { describe, expect, it } from "vitest";

import {
  documentLinkTone,
  submissionStatusActionClasses,
  submissionStatusTone,
  tagRequestStatusTone,
} from "./status";

describe("submissionStatusTone", () => {
  it("maps known statuses, defaulting unknowns to neutral", () => {
    expect(submissionStatusTone("new")).toBe("info");
    expect(submissionStatusTone("resolved")).toBe("success");
    expect(submissionStatusTone("reviewed")).toBe("neutral");
    expect(submissionStatusTone("archived")).toBe("neutral");
    expect(submissionStatusTone("bogus")).toBe("neutral");
  });
});

describe("submissionStatusActionClasses (Phase 3C.5 — action buttons track target-status colors)", () => {
  it("Resolve uses the Resolved/success (emerald) family", () => {
    expect(submissionStatusActionClasses("resolved")).toContain("emerald");
  });
  it("Reopen-as-new uses the New/info (sky) family", () => {
    expect(submissionStatusActionClasses("new")).toContain("sky");
  });
  it("Mark/Restore/Reopen-as-reviewed uses the neutral family (no emerald/sky)", () => {
    const cls = submissionStatusActionClasses("reviewed");
    expect(cls).toContain("border-border");
    expect(cls).not.toContain("emerald");
    expect(cls).not.toContain("sky");
  });
  it("Archive uses the neutral family, never destructive red", () => {
    const cls = submissionStatusActionClasses("archived");
    expect(cls).toContain("border-border");
    expect(cls).not.toContain("destructive");
    expect(cls).not.toContain("red-");
  });
  it("every variant keeps focus-visible + disabled affordances", () => {
    for (const s of ["new", "reviewed", "resolved", "archived"]) {
      const cls = submissionStatusActionClasses(s);
      expect(cls).toContain("focus-visible:ring");
      expect(cls).toContain("disabled:opacity-60");
    }
  });
});

describe("tagRequestStatusTone", () => {
  it("maps lifecycle statuses to tones", () => {
    expect(tagRequestStatusTone("requested")).toBe("info");
    expect(tagRequestStatusTone("in_production")).toBe("warning");
    expect(tagRequestStatusTone("ready")).toBe("success");
    expect(tagRequestStatusTone("delivered")).toBe("success");
    expect(tagRequestStatusTone("cancelled")).toBe("neutral");
  });
});

describe("documentLinkTone", () => {
  it("maps link health to tones", () => {
    expect(documentLinkTone("ok")).toBe("success");
    expect(documentLinkTone("broken")).toBe("danger");
    expect(documentLinkTone("needs_review")).toBe("warning");
    expect(documentLinkTone("unknown")).toBe("neutral");
  });
});
