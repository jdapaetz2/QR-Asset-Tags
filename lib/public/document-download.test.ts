import { describe, expect, it } from "vitest";

import { isDownloadOnlyPath, toPreviewDocuments } from "./documents";

// Hosted HEIC/HEIF originals are downloads on the scan page, never "Open" (D4.1).

describe("isDownloadOnlyPath", () => {
  it("marks HEIC and HEIF originals only", () => {
    expect(isDownloadOnlyPath("org/o/asset/a/documents/d/d.heic")).toBe(true);
    expect(isDownloadOnlyPath("org/o/asset/a/documents/d/d.HEIF")).toBe(true);
    expect(isDownloadOnlyPath("org/o/asset/a/documents/d/d.avif")).toBe(false);
    expect(isDownloadOnlyPath("org/o/asset/a/documents/d/d.pdf")).toBe(false);
  });
});

describe("toPreviewDocuments", () => {
  it("carries the download-only flag for a hosted HEIC, and leaves other documents unchanged", () => {
    const docs = toPreviewDocuments([
      { id: "1", title: "Warranty photo", document_type: "other", url: null, storage_path: "o/d/1.heic", link_status: "ok" },
      { id: "2", title: "Manual", document_type: "manual", url: null, storage_path: "o/d/2.pdf", link_status: "ok" },
    ]);
    expect(docs[0]).toMatchObject({ id: "1", downloadOnly: true });
    expect(docs[1]).not.toHaveProperty("downloadOnly");
  });
});
