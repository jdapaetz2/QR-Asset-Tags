import { describe, expect, it } from "vitest";

import { belongsToScannedAsset } from "./record-context";

describe("belongsToScannedAsset", () => {
  const scanned = "a1b2c3d4-0000-0000-0000-000000000000";

  it("accepts a record whose asset_id matches the scanned asset", () => {
    expect(belongsToScannedAsset(scanned, scanned)).toBe(true);
  });

  it("rejects a record from a different asset (cross-asset pairing)", () => {
    expect(belongsToScannedAsset("b2c3d4e5-0000-0000-0000-000000000000", scanned)).toBe(false);
  });

  it("rejects null/undefined/empty record asset ids (cross-org RLS hides the row → null)", () => {
    expect(belongsToScannedAsset(null, scanned)).toBe(false);
    expect(belongsToScannedAsset(undefined, scanned)).toBe(false);
    expect(belongsToScannedAsset("", scanned)).toBe(false);
  });
});
