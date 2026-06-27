import { describe, expect, it } from "vitest";

import {
  LOGO_BUCKET,
  LOGO_MAX_BYTES,
  logoObjectName,
  logoPathPrefix,
  logoUrlForSave,
  managedLogoObjectPath,
  validateLogoFile,
} from "./logo";

describe("validateLogoFile", () => {
  it("accepts jpeg/png/webp under the size cap", () => {
    expect(validateLogoFile({ type: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateLogoFile({ type: "image/png", size: 1024 })).toBeNull();
    expect(validateLogoFile({ type: "image/webp", size: 1024 })).toBeNull();
  });

  it("rejects svg/pdf/gif and oversize (defers SVG uploads)", () => {
    expect(validateLogoFile({ type: "image/svg+xml", size: 10 })).toMatch(/JPG/i);
    expect(validateLogoFile({ type: "application/pdf", size: 10 })).toMatch(/JPG/i);
    expect(validateLogoFile({ type: "image/gif", size: 10 })).toMatch(/JPG/i);
    expect(
      validateLogoFile({ type: "image/png", size: LOGO_MAX_BYTES + 1 })
    ).toMatch(/2 MB/i);
  });
});

describe("logo path helpers", () => {
  it("builds an org-scoped path and extension-mapped name", () => {
    expect(logoPathPrefix("org1")).toBe("org/org1/logo");
    expect(logoObjectName("uuid-1", "image/jpeg")).toBe("uuid-1.jpg");
    expect(logoObjectName("uuid-1", "image/webp")).toBe("uuid-1.webp");
  });
});

describe("logoUrlForSave (file wins)", () => {
  it("blanks the URL when a file is chosen, else uses it", () => {
    expect(logoUrlForSave({ hasFile: true, urlValue: "https://x/logo.png" })).toBe("");
    expect(logoUrlForSave({ hasFile: false, urlValue: "https://x/logo.png" })).toBe(
      "https://x/logo.png"
    );
    expect(logoUrlForSave({ hasFile: false, urlValue: null })).toBe("");
  });
});

describe("managedLogoObjectPath", () => {
  const org = "11111111";
  const base = `https://proj.supabase.co/storage/v1/object/public/${LOGO_BUCKET}`;

  it("returns the object path for this org's own logo object", () => {
    expect(managedLogoObjectPath(`${base}/org/${org}/logo/abc.png`, org)).toBe(
      `org/${org}/logo/abc.png`
    );
  });

  it("ignores external URLs, /demo-assets, and other orgs", () => {
    expect(managedLogoObjectPath("https://cdn.example.com/l.png", org)).toBeNull();
    expect(managedLogoObjectPath("/demo-assets/x.svg", org)).toBeNull();
    expect(managedLogoObjectPath(`${base}/org/other/logo/x.png`, org)).toBeNull();
    expect(managedLogoObjectPath(null, org)).toBeNull();
  });
});
