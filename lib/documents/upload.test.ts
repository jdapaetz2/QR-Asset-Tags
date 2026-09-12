import { describe, expect, it } from "vitest";

import {
  DOC_ACCEPT,
  DOC_MAX_BYTES,
  documentFileFormat,
  documentMimeFromBytes,
  documentObjectName,
  documentOpensInBrowser,
  documentPathPrefix,
  extForDocumentMime,
  formatFileSize,
  isAllowedDocType,
  validateDocumentFile,
} from "./upload";

describe("isAllowedDocType", () => {
  it("allows pdf, web and phone images, and video; rejects others", () => {
    expect(isAllowedDocType("application/pdf")).toBe(true);
    expect(isAllowedDocType("video/webm")).toBe(true);
    for (const type of ["image/heic", "image/heif", "image/avif"]) expect(isAllowedDocType(type)).toBe(true);
    expect(isAllowedDocType("image/svg+xml")).toBe(false);
    expect(isAllowedDocType("image/tiff")).toBe(false);
    expect(isAllowedDocType("text/html")).toBe(false);
  });

  it("offers the phone image extensions some systems leave untyped", () => {
    expect(DOC_ACCEPT).toContain(".heic");
    expect(DOC_ACCEPT).toContain("application/pdf");
  });
});

describe("validateDocumentFile", () => {
  it("rejects bad type and oversized files", () => {
    expect(validateDocumentFile({ type: "text/html", size: 1 })).toMatch(/PDF/i);
    expect(
      validateDocumentFile({ type: "application/pdf", size: DOC_MAX_BYTES + 1 })
    ).toMatch(/50 MB/i);
    expect(validateDocumentFile({ type: "application/pdf", size: 1024 })).toBeNull();
    expect(validateDocumentFile({ type: "image/heic", size: 3_000_000 })).toBeNull();
    // Windows leaves a HEIC untyped; the form sets the type from the bytes before this check.
    expect(validateDocumentFile({ type: "", size: 3_000_000 })).not.toBeNull();
  });
});

describe("documentMimeFromBytes", () => {
  it("keeps a declared type the bytes agree with, and otherwise uses the bytes' own type", () => {
    expect(documentMimeFromBytes("heic", "")).toBe("image/heic");
    expect(documentMimeFromBytes("heic", "image/heif")).toBe("image/heif");
    expect(documentMimeFromBytes("heic", "video/mp4")).toBe("image/heic");
    expect(documentMimeFromBytes("avif", "application/octet-stream")).toBe("image/avif");
    expect(documentMimeFromBytes("quicktime", "video/mp4")).toBe("video/mp4");
    expect(documentMimeFromBytes("pdf", "application/pdf")).toBe("application/pdf");
    expect(documentMimeFromBytes(null, "application/pdf")).toBeNull();
  });
});

describe("path helpers", () => {
  it("builds an org/asset-scoped prefix and opaque name", () => {
    expect(documentPathPrefix("o1", "a1", "d1")).toBe(
      "org/o1/asset/a1/documents/d1"
    );
    expect(documentObjectName("d1", "application/pdf")).toBe("d1.pdf");
    expect(documentObjectName("d1", "image/png")).toBe("d1.png");
    expect(documentObjectName("d1", "image/heic")).toBe("d1.heic");
    expect(extForDocumentMime("image/avif")).toBe("avif");
  });
});

describe("display helpers", () => {
  it("names the stored format and size", () => {
    expect(documentFileFormat("org/o/asset/a/documents/d/d.heic")).toBe("HEIC image");
    expect(documentFileFormat("org/o/asset/a/documents/d/d.PDF")).toBe("PDF");
    expect(documentFileFormat("legacy/file.bin")).toBeNull();
    expect(formatFileSize(3_355_443)).toBe("3.2 MB");
    expect(formatFileSize(850_000)).toBe("830 KB");
    expect(formatFileSize(10)).toBe("1 KB");
  });

  it("offers HEIC and HEIF originals as downloads, and opens everything else", () => {
    expect(documentOpensInBrowser("d/d.heic")).toBe(false);
    expect(documentOpensInBrowser("d/d.heif")).toBe(false);
    expect(documentOpensInBrowser("d/d.avif")).toBe(true);
    expect(documentOpensInBrowser("d/d.pdf")).toBe(true);
  });
});
