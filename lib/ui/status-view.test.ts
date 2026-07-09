import { describe, expect, it } from "vitest";

import { assetReadiness } from "@/lib/qr/production";
import {
  deriveAssetStatus,
  readinessReasonLabel,
  type AssetStatusInput,
} from "./status-view";

const READY: AssetStatusInput = {
  rented: false,
  publicStatus: "public",
  qrStatus: "active",
  pageStatus: "published",
};

describe("deriveAssetStatus — rental state", () => {
  it("maps rented / available", () => {
    expect(deriveAssetStatus({ ...READY, rented: true }).rentalState).toBe("rented");
    expect(deriveAssetStatus({ ...READY, rented: false }).rentalState).toBe("available");
  });
});

describe("deriveAssetStatus — visibility", () => {
  it("public / private / archived (archived wins)", () => {
    expect(deriveAssetStatus(READY).visibility).toBe("public");
    expect(deriveAssetStatus({ ...READY, publicStatus: "private" }).visibility).toBe("private");
    expect(
      deriveAssetStatus({ ...READY, publicStatus: "public", archivedAt: "2026-01-01" }).visibility
    ).toBe("archived");
  });
});

describe("deriveAssetStatus — readiness reasons", () => {
  it("ready when public + active QR + published page", () => {
    const r = deriveAssetStatus(READY).readiness;
    expect(r.ready).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.reasons).toEqual([]);
  });

  it("maps each blocker", () => {
    expect(deriveAssetStatus({ ...READY, qrStatus: null }).readiness.reason).toBe("missing_qr");
    expect(deriveAssetStatus({ ...READY, qrStatus: "disabled" }).readiness.reason).toBe("qr_inactive");
    expect(deriveAssetStatus({ ...READY, pageStatus: "missing" }).readiness.reason).toBe("page_missing");
    expect(deriveAssetStatus({ ...READY, pageStatus: "draft" }).readiness.reason).toBe("page_draft");
    expect(deriveAssetStatus({ ...READY, publicStatus: "private" }).readiness.reason).toBe("asset_private");
  });

  it("only emits org_inactive when orgActive === false", () => {
    expect(deriveAssetStatus(READY).readiness.reasons).not.toContain("org_inactive");
    expect(deriveAssetStatus({ ...READY, orgActive: true }).readiness.reasons).not.toContain("org_inactive");
    expect(deriveAssetStatus({ ...READY, orgActive: false }).readiness.reason).toBe("org_inactive");
  });

  it("priority: a QR/page blocker surfaces before private (lock carries privacy)", () => {
    const r = deriveAssetStatus({
      ...READY,
      qrStatus: null,
      pageStatus: "draft",
      publicStatus: "private",
    }).readiness;
    expect(r.reason).toBe("missing_qr");
    expect(r.reasons).toEqual(["missing_qr", "page_draft", "asset_private"]);
  });
});

describe("readinessReasonLabel", () => {
  it("labels every reason", () => {
    expect(readinessReasonLabel("missing_qr")).toBe("No QR");
    expect(readinessReasonLabel("qr_inactive")).toBe("QR inactive");
    expect(readinessReasonLabel("page_missing")).toBe("No page");
    expect(readinessReasonLabel("page_draft")).toBe("Page draft");
    expect(readinessReasonLabel("asset_private")).toBe("Private");
    expect(readinessReasonLabel("org_inactive")).toBe("Org suspended");
  });
});

describe("agreement with assetReadiness (canonical producer)", () => {
  const cases: AssetStatusInput[] = [
    READY,
    { ...READY, qrStatus: null },
    { ...READY, qrStatus: "disabled" },
    { ...READY, pageStatus: "missing" },
    { ...READY, pageStatus: "draft" },
    { ...READY, publicStatus: "private" },
    { rented: true, publicStatus: "private", qrStatus: null, pageStatus: "missing" },
  ];
  it("ready verdict + blocker count match on shared inputs", () => {
    for (const c of cases) {
      const view = deriveAssetStatus(c);
      const canonical = assetReadiness({
        public_status: c.publicStatus,
        qrStatus: c.qrStatus,
        pageStatus: c.pageStatus,
      });
      expect(view.readiness.ready).toBe(canonical.ready);
      expect(view.readiness.reasons.length).toBe(canonical.issues.length);
    }
  });
});
