import { describe, expect, it } from "vitest";

import {
  findDocumentHref,
  isDocumentOpenable,
  toPreviewDocuments,
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

describe("toPreviewDocuments", () => {
  it("qualifies external http(s) links and hosted objects, with an inert href", () => {
    const out = toPreviewDocuments([
      {
        id: "1",
        title: "Manual",
        document_type: "manual",
        url: "https://docs.example/m.pdf",
        storage_path: null,
        link_status: "ok",
      },
      {
        id: "2",
        title: "Guide",
        document_type: "startup_guide",
        url: null,
        storage_path: "org/1/guide.pdf",
        link_status: "needs_review",
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((d) => d.href === "#")).toBe(true);
    expect(out[0]).toMatchObject({ external: true, link_status: "ok" });
    expect(out[1]).toMatchObject({ external: false, link_status: "needs_review" });
    expect(out[1]).not.toHaveProperty("storage_path");
  });

  it("drops rows with no usable source or a non-http url", () => {
    const out = toPreviewDocuments([
      {
        id: "3",
        title: "Bad",
        document_type: "other",
        url: "javascript:alert(1)",
        storage_path: null,
        link_status: null,
      },
      {
        id: "4",
        title: "Empty",
        document_type: "other",
        url: null,
        storage_path: null,
        link_status: null,
      },
    ]);
    expect(out).toHaveLength(0);
  });

  it("drives the Manual/Start-Up button helpers", () => {
    const out = toPreviewDocuments([
      {
        id: "1",
        title: "Manual",
        document_type: "manual",
        url: "https://x.test/m",
        storage_path: null,
        link_status: "ok",
      },
    ]);
    expect(findDocumentHref(out, "manual")).toBe("#");
    expect(findDocumentHref(out, "startup_guide")).toBeNull();
  });
});
