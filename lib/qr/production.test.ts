import { describe, expect, it } from "vitest";

import { assetReadiness, isProductionBaseUrl } from "./production";

describe("isProductionBaseUrl", () => {
  it("rejects localhost and vercel previews", () => {
    expect(isProductionBaseUrl("http://localhost:3000")).toBe(false);
    expect(isProductionBaseUrl("http://127.0.0.1:3000")).toBe(false);
    expect(isProductionBaseUrl("https://my-app-git-x.vercel.app")).toBe(false);
    expect(isProductionBaseUrl("not a url")).toBe(false);
  });

  it("accepts a real production domain", () => {
    expect(isProductionBaseUrl("https://tags.assettag.example")).toBe(true);
    expect(isProductionBaseUrl("https://app.northridge.com")).toBe(true);
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
