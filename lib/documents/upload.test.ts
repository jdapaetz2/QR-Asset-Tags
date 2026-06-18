import { describe, expect, it } from "vitest";

import {
  DOC_MAX_BYTES,
  documentObjectName,
  documentPathPrefix,
  isAllowedDocType,
  validateDocumentFile,
} from "./upload";

describe("isAllowedDocType", () => {
  it("allows pdf/images/video and rejects others", () => {
    expect(isAllowedDocType("application/pdf")).toBe(true);
    expect(isAllowedDocType("video/webm")).toBe(true);
    expect(isAllowedDocType("text/html")).toBe(false);
  });
});

describe("validateDocumentFile", () => {
  it("rejects bad type and oversized files", () => {
    expect(validateDocumentFile({ type: "text/html", size: 1 })).toMatch(/PDF/i);
    expect(
      validateDocumentFile({ type: "application/pdf", size: DOC_MAX_BYTES + 1 })
    ).toMatch(/50 MB/i);
    expect(validateDocumentFile({ type: "application/pdf", size: 1024 })).toBeNull();
  });
});

describe("path helpers", () => {
  it("builds an org/asset-scoped prefix and opaque name", () => {
    expect(documentPathPrefix("o1", "a1", "d1")).toBe(
      "org/o1/asset/a1/documents/d1"
    );
    expect(documentObjectName("d1", "application/pdf")).toBe("d1.pdf");
    expect(documentObjectName("d1", "image/png")).toBe("d1.png");
  });
});
