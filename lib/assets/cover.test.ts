import { describe, expect, it } from "vitest";

import {
  COVER_BUCKET,
  COVER_MAX_BYTES,
  coverObjectName,
  coverPathPrefix,
  isAllowedCoverType,
  managedCoverObjectPath,
  validateCoverFile,
} from "./cover";

describe("validateCoverFile", () => {
  it("accepts jpeg/png/webp under the size cap", () => {
    expect(validateCoverFile({ type: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateCoverFile({ type: "image/png", size: 1024 })).toBeNull();
    expect(validateCoverFile({ type: "image/webp", size: 1024 })).toBeNull();
  });

  it("rejects disallowed types (svg/pdf/gif/heic)", () => {
    expect(validateCoverFile({ type: "image/svg+xml", size: 10 })).toMatch(/JPG/i);
    expect(validateCoverFile({ type: "application/pdf", size: 10 })).toMatch(/JPG/i);
    expect(validateCoverFile({ type: "image/gif", size: 10 })).toMatch(/JPG/i);
    expect(validateCoverFile({ type: "image/heic", size: 10 })).toMatch(/JPG/i);
    expect(isAllowedCoverType("image/svg+xml")).toBe(false);
  });

  it("rejects files over 5 MB", () => {
    expect(
      validateCoverFile({ type: "image/jpeg", size: COVER_MAX_BYTES + 1 })
    ).toMatch(/5 MB/i);
  });
});

describe("coverPathPrefix / coverObjectName", () => {
  it("builds an org/asset-scoped path and an extension-mapped name", () => {
    expect(coverPathPrefix("org1", "asset1")).toBe(
      "org/org1/asset/asset1/cover"
    );
    expect(coverObjectName("uuid-1", "image/jpeg")).toBe("uuid-1.jpg");
    expect(coverObjectName("uuid-1", "image/png")).toBe("uuid-1.png");
    expect(coverObjectName("uuid-1", "image/webp")).toBe("uuid-1.webp");
  });
});

describe("managedCoverObjectPath", () => {
  const org = "11111111";
  const asset = "21111111";
  const base = `https://proj.supabase.co/storage/v1/object/public/${COVER_BUCKET}`;

  it("returns the object path for this org/asset's own cover object", () => {
    const url = `${base}/org/${org}/asset/${asset}/cover/abc.jpg`;
    expect(managedCoverObjectPath(url, org, asset)).toBe(
      `org/${org}/asset/${asset}/cover/abc.jpg`
    );
  });

  it("ignores external URLs, /demo-assets paths, and other org/asset objects", () => {
    expect(managedCoverObjectPath("https://cdn.example.com/x.jpg", org, asset)).toBeNull();
    expect(managedCoverObjectPath("/demo-assets/excavator-017.svg", org, asset)).toBeNull();
    expect(
      managedCoverObjectPath(`${base}/org/other/asset/${asset}/cover/x.jpg`, org, asset)
    ).toBeNull();
    expect(managedCoverObjectPath(null, org, asset)).toBeNull();
  });
});
