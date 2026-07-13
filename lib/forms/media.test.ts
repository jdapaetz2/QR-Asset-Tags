import { describe, expect, it } from "vitest";

import {
  extForMime,
  INSPECTION_MAX_FILES,
  INSPECTION_MAX_TOTAL_BYTES,
  isAllowedImageType,
  MAX_FILE_BYTES,
  mediaObjectName,
  submissionPathPrefix,
  validateInspectionFiles,
  validateUploadFiles,
} from "./media";

describe("isAllowedImageType / extForMime", () => {
  it("allows jpeg/png/webp only", () => {
    expect(isAllowedImageType("image/png")).toBe(true);
    expect(isAllowedImageType("image/webp")).toBe(true);
    expect(isAllowedImageType("video/mp4")).toBe(false);
    expect(isAllowedImageType("application/pdf")).toBe(false);
  });

  it("maps mime to extension", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("image/png")).toBe("png");
    expect(extForMime("application/x-evil")).toBe("bin");
  });
});

describe("validateUploadFiles", () => {
  it("allows zero files (media is optional) but caps at five", () => {
    expect(validateUploadFiles([])).toBeNull();
    expect(
      validateUploadFiles(
        Array.from({ length: 6 }, () => ({ type: "image/png", size: 1 }))
      )
    ).toMatch(/at most/i);
  });

  it("rejects bad type and oversized files", () => {
    expect(validateUploadFiles([{ type: "video/mp4", size: 1 }])).toMatch(
      /allowed/i
    );
    expect(
      validateUploadFiles([{ type: "image/png", size: MAX_FILE_BYTES + 1 }])
    ).toMatch(/10 MB/i);
  });

  it("accepts a valid set", () => {
    expect(
      validateUploadFiles([{ type: "image/jpeg", size: 1024 }])
    ).toBeNull();
  });
});

describe("validateInspectionFiles", () => {
  const img = (over: Partial<{ type: string; size: number; name: string }> = {}) => ({
    type: "image/jpeg",
    size: 1024,
    name: "photo.jpg",
    ...over,
  });

  it("allows zero files (per-slot minimums are enforced elsewhere)", () => {
    expect(validateInspectionFiles([])).toBeNull();
  });

  it("caps the file count at eight", () => {
    expect(
      validateInspectionFiles(
        Array.from({ length: INSPECTION_MAX_FILES }, () => img())
      )
    ).toBeNull();
    expect(
      validateInspectionFiles(
        Array.from({ length: INSPECTION_MAX_FILES + 1 }, () => img())
      )
    ).toMatch(/at most 8/i);
  });

  it("caps the total bytes at 40 MB", () => {
    // Five 9 MB files: each is under the 10 MB per-file cap, but 45 MB total exceeds 40 MB.
    const nineMb = 9 * 1024 * 1024;
    expect(nineMb).toBeLessThanOrEqual(MAX_FILE_BYTES);
    expect(5 * nineMb).toBeGreaterThan(INSPECTION_MAX_TOTAL_BYTES);
    expect(
      validateInspectionFiles(Array.from({ length: 5 }, () => img({ size: nineMb })))
    ).toMatch(/40 MB/i);
  });

  it("rejects a disallowed mime type", () => {
    expect(validateInspectionFiles([img({ type: "video/mp4", name: "clip.mp4" })])).toMatch(
      /allowed/i
    );
  });

  it("rejects a mismatched / disallowed extension", () => {
    expect(validateInspectionFiles([img({ name: "photo.gif" })])).toMatch(/allowed/i);
  });

  it("rejects a single oversized file", () => {
    expect(
      validateInspectionFiles([img({ size: MAX_FILE_BYTES + 1 })])
    ).toMatch(/10 MB/i);
  });

  it("accepts a valid multi-photo set", () => {
    expect(
      validateInspectionFiles([
        img({ type: "image/png", name: "a.png" }),
        img({ type: "image/webp", name: "b.webp" }),
        img(),
      ])
    ).toBeNull();
  });
});

describe("path helpers", () => {
  it("builds an org/asset-scoped prefix", () => {
    expect(submissionPathPrefix("o1", "a1", "s1")).toBe(
      "org/o1/asset/a1/submission/s1"
    );
  });

  it("names objects without user input", () => {
    expect(mediaObjectName("uuid", "image/webp")).toBe("uuid.webp");
  });
});
