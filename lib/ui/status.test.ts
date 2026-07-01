import { describe, expect, it } from "vitest";

import {
  documentLinkTone,
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
