import { describe, expect, it } from "vitest";

import { validateDocumentForm } from "./validate";

const base = {
  title: "Operator manual",
  document_type: "manual",
  visibility: "private",
  url: "https://example.com/manual.pdf",
};

describe("validateDocumentForm", () => {
  it("accepts a valid document", () => {
    expect(validateDocumentForm(base)).toBeNull();
    expect(validateDocumentForm({ ...base, url: null })).toBeNull();
  });

  it("requires a title", () => {
    expect(validateDocumentForm({ ...base, title: "  " })).toMatch(/title/i);
  });

  it("enforces type, visibility, and link_status allow-lists", () => {
    expect(validateDocumentForm({ ...base, document_type: "blueprint" })).toMatch(
      /document type/i
    );
    expect(validateDocumentForm({ ...base, visibility: "secret" })).toMatch(
      /visibility/i
    );
    expect(
      validateDocumentForm({ ...base, link_status: "maybe" })
    ).toMatch(/link status/i);
    expect(validateDocumentForm({ ...base, link_status: "ok" })).toBeNull();
  });

  it("validates URL format when provided", () => {
    expect(validateDocumentForm({ ...base, url: "ftp://x" })).toMatch(/url/i);
    expect(validateDocumentForm({ ...base, url: "not a url" })).toMatch(/url/i);
  });
});
