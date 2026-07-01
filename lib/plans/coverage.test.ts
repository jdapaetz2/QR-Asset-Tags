import { describe, expect, it } from "vitest";

import {
  countCoveredAssets,
  coveredCountByOrg,
  isOverCoverage,
  remainingCoverage,
} from "./coverage";

describe("countCoveredAssets", () => {
  it("counts non-archived assets that have a QR link; ignores links to unknown/archived", () => {
    // a1, a2 non-archived; a3 archived (not passed in nonArchived list).
    const nonArchived = ["a1", "a2"];
    // a1 has one link, a2 has two (still one covered asset), a3 has a link but archived.
    const qrAssetIds = ["a1", "a2", "a2", "a3"];
    expect(countCoveredAssets(nonArchived, qrAssetIds)).toBe(2);
  });

  it("excludes non-archived assets with no link", () => {
    expect(countCoveredAssets(["a1", "a2"], ["a1"])).toBe(1);
  });

  it("counts an asset whose only link is disabled (link existence, not status)", () => {
    // The caller passes asset ids from qr_links regardless of status.
    expect(countCoveredAssets(["a1"], ["a1"])).toBe(1);
  });
});

describe("coveredCountByOrg", () => {
  it("groups covered counts per org, skipping archived + unlinked", () => {
    const assets = [
      { id: "a1", organization_id: "o1", archived_at: null },
      { id: "a2", organization_id: "o1", archived_at: "2026-01-01T00:00:00Z" },
      { id: "a3", organization_id: "o1", archived_at: null },
      { id: "b1", organization_id: "o2", archived_at: null },
    ];
    const qr = [
      { asset_id: "a1", organization_id: "o1" },
      { asset_id: "a2", organization_id: "o1" },
      { asset_id: "b1", organization_id: "o2" },
    ];
    const counts = coveredCountByOrg(assets, qr);
    expect(counts.get("o1")).toBe(1); // a1 only (a2 archived, a3 unlinked)
    expect(counts.get("o2")).toBe(1);
  });
});

describe("isOverCoverage / remainingCoverage", () => {
  it("treats a null limit as unlimited", () => {
    expect(isOverCoverage(9999, null)).toBe(false);
    expect(remainingCoverage(9999, null)).toBeNull();
  });
  it("is over when at or above the limit", () => {
    expect(isOverCoverage(100, 100)).toBe(true);
    expect(isOverCoverage(99, 100)).toBe(false);
    expect(remainingCoverage(80, 100)).toBe(20);
    expect(remainingCoverage(120, 100)).toBe(0);
  });
});
