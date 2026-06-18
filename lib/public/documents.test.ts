import { describe, expect, it } from "vitest";

import { findDocumentHref, type PublicDocument } from "./documents";

const docs: PublicDocument[] = [
  {
    id: "1",
    title: "Operator manual",
    document_type: "manual",
    href: "https://example.com/manual.pdf",
    external: true,
  },
  {
    id: "2",
    title: "Quick start",
    document_type: "startup_guide",
    href: "https://example.com/start",
    external: true,
  },
];

describe("findDocumentHref", () => {
  it("returns the first matching type's href", () => {
    expect(findDocumentHref(docs, "manual")).toBe("https://example.com/manual.pdf");
    expect(findDocumentHref(docs, "startup_guide")).toBe(
      "https://example.com/start"
    );
  });

  it("returns null when no document of that type exists", () => {
    expect(findDocumentHref(docs, "safety_sheet")).toBeNull();
    expect(findDocumentHref([], "manual")).toBeNull();
  });
});
