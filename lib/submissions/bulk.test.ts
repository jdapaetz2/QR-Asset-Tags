import { describe, expect, it } from "vitest";

import {
  BULK_MAX,
  bulkResultMessage,
  limitBulkIds,
  partitionBulkResolve,
  type BulkResolveRow,
} from "./bulk";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

describe("limitBulkIds", () => {
  it("keeps only well-formed, de-duplicated UUIDs", () => {
    const { ids, rejected } = limitBulkIds([uuid(1), "nope", uuid(1), uuid(2), ""]);
    expect(ids).toEqual([uuid(1), uuid(2)]);
    expect(rejected).toBe(3); // "nope", duplicate uuid(1), ""
  });

  it("caps at BULK_MAX and reports the overflow as rejected", () => {
    const many = Array.from({ length: BULK_MAX + 5 }, (_, i) => uuid(i + 1));
    const { ids, rejected } = limitBulkIds(many);
    expect(ids).toHaveLength(BULK_MAX);
    expect(rejected).toBe(5);
  });
});

describe("partitionBulkResolve — safe bulk resolve", () => {
  const rented = new Set(["asset-rented"]);
  const rows: BulkResolveRow[] = [
    // active renter return → SKIPPED
    { id: "r1", form_type: "return_checklist", submission_origin: "public", status: "new", asset_id: "asset-rented" },
    // renter return but asset already returned → eligible
    { id: "r2", form_type: "return_checklist", submission_origin: "public", status: "reviewed", asset_id: "asset-free" },
    // staff return → eligible (physical return already done)
    { id: "s1", form_type: "return_checklist", submission_origin: "staff", status: "new", asset_id: "asset-rented" },
    // damage report → eligible
    { id: "d1", form_type: "damage_report", submission_origin: "public", status: "new", asset_id: "asset-rented" },
  ];

  it("skips only the active renter return; resolves the rest", () => {
    const { eligibleIds, skippedActiveRenterReturn } = partitionBulkResolve(rows, rented);
    expect(skippedActiveRenterReturn).toEqual(["r1"]);
    expect(eligibleIds).toEqual(["r2", "s1", "d1"]);
  });

  it("resolves a renter return once its rental is no longer active", () => {
    const { eligibleIds, skippedActiveRenterReturn } = partitionBulkResolve(rows, new Set());
    expect(skippedActiveRenterReturn).toEqual([]);
    expect(eligibleIds).toContain("r1");
  });
});

describe("bulkResultMessage", () => {
  it("summarizes a clean bulk action", () => {
    expect(bulkResultMessage({ targetStatus: "archived", updated: 3, skipped: 0 })).toBe(
      "3 submissions archived."
    );
  });

  it("appends the renter-return skip reason", () => {
    expect(bulkResultMessage({ targetStatus: "resolved", updated: 2, skipped: 1 })).toBe(
      "2 submissions resolved. 1 renter return was skipped because its rental is still active."
    );
  });

  it("pluralizes the skip clause", () => {
    expect(bulkResultMessage({ targetStatus: "resolved", updated: 0, skipped: 2 })).toContain(
      "2 renter returns were skipped because their rental is still active."
    );
  });

  it("maps each target status to a verb", () => {
    expect(bulkResultMessage({ targetStatus: "reviewed", updated: 1, skipped: 0 })).toBe(
      "1 submission marked reviewed."
    );
    expect(bulkResultMessage({ targetStatus: "new", updated: 1, skipped: 0 })).toBe(
      "1 submission reopened."
    );
  });
});
