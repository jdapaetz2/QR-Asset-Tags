import { describe, expect, it } from "vitest";

import {
  assetReadiness,
  isProductionBaseUrl,
  productionBaseUrlIssue,
} from "./production";

describe("isProductionBaseUrl", () => {
  it("rejects localhost and vercel previews", () => {
    expect(isProductionBaseUrl("http://localhost:3000")).toBe(false);
    expect(isProductionBaseUrl("http://127.0.0.1:3000")).toBe(false);
    expect(isProductionBaseUrl("https://my-app-git-x.vercel.app")).toBe(false);
    expect(isProductionBaseUrl("not a url")).toBe(false);
  });

  it("rejects http (non-localhost) and placeholder hosts", () => {
    expect(isProductionBaseUrl("http://app.northridge.com")).toBe(false);
    expect(isProductionBaseUrl("https://example.com")).toBe(false);
  });

  it("accepts a real https production domain", () => {
    expect(isProductionBaseUrl("https://tags.assettag.example")).toBe(true);
    expect(isProductionBaseUrl("https://app.northridge.com")).toBe(true);
  });
});

/**
 * Phase B3 — the canonical Mulemark host. These assertions exist so the permanent-tag classification of
 * the real production domain is locked down rather than incidental.
 *
 * Note the gate is a DENYLIST (non-https / placeholder / *.vercel.app), so `mulemark.io` passes without
 * any host-specific branch. That is deliberate: hard-coding an allowlist would tie tag safety to one
 * string instead of to the environment, and a future `app.mulemark.io` or a customer-specific host would
 * silently fail. These tests pin the behaviour without pinning the implementation to a literal.
 */
describe("the canonical Mulemark production host (Phase B3)", () => {
  it("treats https://mulemark.io as safe for permanent tags", () => {
    expect(productionBaseUrlIssue("https://mulemark.io")).toBeNull();
    expect(isProductionBaseUrl("https://mulemark.io")).toBe(true);
    // A trailing slash is normalized away before this check, but must not change the verdict.
    expect(isProductionBaseUrl("https://mulemark.io/")).toBe(true);
  });

  it("also accepts the www host and a future app subdomain", () => {
    expect(isProductionBaseUrl("https://www.mulemark.io")).toBe(true);
    // A later dashboard move to app.mulemark.io must not need a code change to stay tag-safe.
    expect(isProductionBaseUrl("https://app.mulemark.io")).toBe(true);
  });

  it("still refuses the same domain over http", () => {
    expect(productionBaseUrlIssue("http://mulemark.io")).toMatch(/https/);
  });

  it("keeps preview and local hosts blocked after the domain switch", () => {
    expect(isProductionBaseUrl("https://qr-asset-tags-git-pilot-credibility.vercel.app")).toBe(false);
    expect(isProductionBaseUrl("https://mulemark.io.vercel.app")).toBe(false);
    expect(isProductionBaseUrl("http://localhost:3000")).toBe(false);
  });

  it("accepts the reserved marketing/Canadian domains only as generic hosts", () => {
    // They are structurally valid production origins — nothing in code stops someone pointing
    // NEXT_PUBLIC_SITE_URL at them. The rule that permanent tags must never depend on them is a
    // DOCUMENTED operator decision (QR_DOMAIN_STRATEGY), not a code guarantee. Asserted here so that
    // distinction is explicit rather than assumed.
    expect(isProductionBaseUrl("https://getmulemark.com")).toBe(true);
    expect(isProductionBaseUrl("https://mulemark.ca")).toBe(true);
  });
});

describe("productionBaseUrlIssue", () => {
  it("returns null for a safe URL and a reason otherwise", () => {
    expect(productionBaseUrlIssue("https://app.northridge.com")).toBeNull();
    expect(productionBaseUrlIssue("http://app.northridge.com")).toMatch(/https/);
    expect(productionBaseUrlIssue("https://localhost")).toMatch(/placeholder/);
    expect(productionBaseUrlIssue("https://x.vercel.app")).toMatch(/Vercel/);
    expect(productionBaseUrlIssue("nope")).toMatch(/valid URL/);
  });
});

describe("assetReadiness", () => {
  it("is ready when active QR + public + published page", () => {
    expect(
      assetReadiness({
        public_status: "public",
        qrStatus: "active",
        pageStatus: "published",
      })
    ).toEqual({ ready: true, issues: [] });
  });

  it("lists each blocking condition", () => {
    const r = assetReadiness({
      public_status: "private",
      qrStatus: null,
      pageStatus: "draft",
    });
    expect(r.ready).toBe(false);
    expect(r.issues).toEqual([
      "Missing QR link",
      "Private asset",
      "Draft equipment page",
    ]);
  });

  it("flags inactive QR and missing page", () => {
    const r = assetReadiness({
      public_status: "public",
      qrStatus: "disabled",
      pageStatus: "missing",
    });
    expect(r.issues).toEqual(["Inactive QR link", "Missing equipment page"]);
  });
});
