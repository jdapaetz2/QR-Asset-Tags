import { describe, expect, it } from "vitest";

import {
  findDocumentHref,
  isDocumentOpenable,
  type PublicDocument,
} from "./documents";

function doc(overrides: Partial<PublicDocument> = {}): PublicDocument {
  return {
    id: "1",
    title: "Doc",
    document_type: "manual",
    href: "https://example.com/manual.pdf",
    external: true,
    link_status: "ok",
    ...overrides,
  };
}

const docs: PublicDocument[] = [
  doc({ id: "1", document_type: "manual", href: "https://example.com/manual.pdf" }),
  doc({
    id: "2",
    document_type: "startup_guide",
    href: "https://example.com/start",
    link_status: "unknown",
  }),
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

  it("skips a known-broken document so buttons never point at a dead link", () => {
    const broken = [
      doc({ document_type: "manual", link_status: "broken", href: "https://x/broken" }),
    ];
    expect(findDocumentHref(broken, "manual")).toBeNull();
  });

  it("still returns a needs_review document (openable, just softened in UI)", () => {
    const review = [doc({ document_type: "manual", link_status: "needs_review" })];
    expect(findDocumentHref(review, "manual")).toBe("https://example.com/manual.pdf");
  });
});

describe("isDocumentOpenable", () => {
  it("is false only for broken links", () => {
    expect(isDocumentOpenable(doc({ link_status: "ok" }))).toBe(true);
    expect(isDocumentOpenable(doc({ link_status: "unknown" }))).toBe(true);
    expect(isDocumentOpenable(doc({ link_status: "needs_review" }))).toBe(true);
    expect(isDocumentOpenable(doc({ link_status: "broken" }))).toBe(false);
  });
});
