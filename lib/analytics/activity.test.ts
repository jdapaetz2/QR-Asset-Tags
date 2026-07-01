import { describe, expect, it } from "vitest";

import {
  dailyCounts,
  normalizeAssetSort,
  perAssetActivity,
  sortAssetRows,
  summarizeActivity,
  type ScanRow,
  type SubmissionRow,
} from "./activity";

const NOW = new Date("2026-06-19T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("dailyCounts", () => {
  it("returns exactly `days` buckets, oldest → newest, ending today", () => {
    const series = dailyCounts([], 30, NOW);
    expect(series).toHaveLength(30);
    expect(series[29].date).toBe("2026-06-19");
    expect(series[0].date).toBe("2026-05-21");
    expect(series.every((b) => b.count === 0)).toBe(true);
  });

  it("buckets timestamps by UTC day and ignores invalid dates", () => {
    const series = dailyCounts(
      [
        "2026-06-19T01:00:00.000Z",
        "2026-06-19T23:00:00.000Z",
        "2026-06-18T10:00:00.000Z",
        "not-a-date",
      ],
      30,
      NOW
    );
    const today = series.find((b) => b.date === "2026-06-19");
    const yesterday = series.find((b) => b.date === "2026-06-18");
    expect(today?.count).toBe(2);
    expect(yesterday?.count).toBe(1);
  });
});

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY).toISOString();
}

const scans: ScanRow[] = [
  { asset_id: "a1", scanned_at: daysAgo(1) },
  { asset_id: "a1", scanned_at: daysAgo(6) },
  { asset_id: "a2", scanned_at: daysAgo(8) },
  { asset_id: "a2", scanned_at: daysAgo(40) },
];

const submissions: SubmissionRow[] = [
  { asset_id: "a1", form_type: "damage_report", status: "new" },
  { asset_id: "a1", form_type: "support_request", status: "reviewed" },
  { asset_id: "a2", form_type: "return_checklist", status: "resolved" },
  { asset_id: "a2", form_type: "support_request", status: "new" },
  { asset_id: "a2", form_type: "pre_use_inspection", status: "archived" },
];

describe("summarizeActivity", () => {
  it("counts scans within the 7- and 30-day windows by boundary", () => {
    const s = summarizeActivity(scans, submissions, NOW);
    expect(s.totalScans).toBe(4);
    // 1d + 6d are within 7d; 8d and 40d are not.
    expect(s.scans7d).toBe(2);
    // 1d + 6d + 8d are within 30d; 40d is not.
    expect(s.scans30d).toBe(3);
  });

  it("tallies submissions by type and status with all keys present", () => {
    const s = summarizeActivity(scans, submissions, NOW);
    expect(s.totalSubmissions).toBe(5);
    expect(s.newSubmissions).toBe(2);
    expect(s.byType).toEqual({
      damage_report: 1,
      support_request: 2,
      return_checklist: 1,
    });
    expect(s.byStatus).toEqual({
      new: 2,
      reviewed: 1,
      resolved: 1,
      archived: 1,
    });
  });

  it("returns zeroed maps for no activity", () => {
    const s = summarizeActivity([], [], NOW);
    expect(s.totalScans).toBe(0);
    expect(s.byType.damage_report).toBe(0);
    expect(s.byStatus.new).toBe(0);
  });
});

describe("perAssetActivity", () => {
  it("groups scans and submissions per asset with the latest scan time", () => {
    const map = perAssetActivity(scans, submissions);
    expect(map.get("a1")).toEqual({
      totalScans: 2,
      lastScannedAt: daysAgo(1),
      submissionCount: 2,
    });
    expect(map.get("a2")).toEqual({
      totalScans: 2,
      lastScannedAt: daysAgo(8),
      submissionCount: 3,
    });
  });

  it("includes assets that only have submissions (no scans)", () => {
    const map = perAssetActivity(
      [],
      [{ asset_id: "a3", form_type: "damage_report", status: "new" }]
    );
    expect(map.get("a3")).toEqual({
      totalScans: 0,
      lastScannedAt: null,
      submissionCount: 1,
    });
  });
});

describe("normalizeAssetSort", () => {
  it("accepts known sorts and falls back to scans_desc otherwise", () => {
    expect(normalizeAssetSort("submissions_desc")).toBe("submissions_desc");
    expect(normalizeAssetSort("last_scanned_desc")).toBe("last_scanned_desc");
    expect(normalizeAssetSort("scans_desc")).toBe("scans_desc");
    expect(normalizeAssetSort("nonsense")).toBe("scans_desc");
    expect(normalizeAssetSort(undefined)).toBe("scans_desc");
    expect(normalizeAssetSort(["scans_desc"])).toBe("scans_desc");
  });
});

describe("sortAssetRows", () => {
  const rows = [
    { id: "a", totalScans: 1, submissionCount: 5, lastScannedAt: daysAgo(2) },
    { id: "b", totalScans: 9, submissionCount: 0, lastScannedAt: null },
    { id: "c", totalScans: 4, submissionCount: 2, lastScannedAt: daysAgo(1) },
  ];

  it("sorts by scans, submissions, and last scanned (nulls last)", () => {
    expect(sortAssetRows(rows, "scans_desc").map((r) => r.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortAssetRows(rows, "submissions_desc").map((r) => r.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    // c (1d) before a (2d); b has no scan time → last.
    expect(sortAssetRows(rows, "last_scanned_desc").map((r) => r.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("does not mutate the input array", () => {
    const before = rows.map((r) => r.id);
    sortAssetRows(rows, "scans_desc");
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});
