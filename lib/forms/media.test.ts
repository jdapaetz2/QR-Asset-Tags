import { describe, expect, it } from "vitest";

import {
  extForMime,
  isAllowedImageType,
  MAX_FILE_BYTES,
  mediaObjectName,
  submissionPathPrefix,
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
  it("requires at least one and at most five", () => {
    expect(validateUploadFiles([])).toMatch(/at least one/i);
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
