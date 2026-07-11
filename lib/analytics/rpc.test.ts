import { describe, expect, it } from "vitest";

import {
  buildBreakdown,
  toDailySeries,
  type BreakdownRow,
  type DailyActivityRow,
} from "./rpc";

describe("toDailySeries", () => {
  const rows: DailyActivityRow[] = [
    { day: "2026-07-07", scan_count: 95, new_submission_count: 1 },
    { day: "2026-07-08", scan_count: 3, new_submission_count: 0 },
    { day: "2026-07-09", scan_count: 112, new_submission_count: 2 },
    { day: "2026-07-10", scan_count: 172, new_submission_count: 4 },
  ];

  it("splits daily rows into scan + new-submission series, preserving order", () => {
    const { scans, newSubmissions } = toDailySeries(rows);
    expect(scans).toEqual([
      { date: "2026-07-07", count: 95 },
      { date: "2026-07-08", count: 3 },
      { date: "2026-07-09", count: 112 },
      { date: "2026-07-10", count: 172 },
    ]);
    expect(newSubmissions.map((d) => d.count)).toEqual([1, 0, 2, 4]);
    // Bucket sums equal the chart-header totals.
    expect(scans.reduce((n, d) => n + d.count, 0)).toBe(382);
  });

  it("coerces bigint-as-string counts to numbers", () => {
    const series = toDailySeries([
      {
        day: "2026-07-10",
        scan_count: "172" as unknown as number,
        new_submission_count: "4" as unknown as number,
      },
    ]);
    expect(series.scans[0].count).toBe(172);
    expect(series.newSubmissions[0].count).toBe(4);
  });

  it("returns empty series for no rows", () => {
    expect(toDailySeries([])).toEqual({ scans: [], newSubmissions: [] });
  });
});

describe("buildBreakdown", () => {
  it("folds status + form_type rows into fully-keyed maps", () => {
    const rows: BreakdownRow[] = [
      { breakdown_type: "status", key: "new", count: 5 },
      { breakdown_type: "status", key: "resolved", count: 2 },
      { breakdown_type: "form_type", key: "damage_report", count: 4 },
      { breakdown_type: "form_type", key: "support_request", count: 3 },
    ];
    const { byStatus, byType } = buildBreakdown(rows);
    // Present keys carry their counts; absent keys stay 0.
    expect(byStatus).toEqual({ new: 5, reviewed: 0, resolved: 2, archived: 0 });
    expect(byType).toEqual({
      damage_report: 4,
      support_request: 3,
      return_checklist: 0,
    });
  });

  it("coerces bigint-as-string counts to numbers", () => {
    const rows = [
      { breakdown_type: "status", key: "new", count: "7" as unknown as number },
    ];
    expect(buildBreakdown(rows).byStatus.new).toBe(7);
  });

  it("ignores unknown keys, including the unsurfaced pre_use_inspection", () => {
    const rows: BreakdownRow[] = [
      { breakdown_type: "form_type", key: "pre_use_inspection", count: 9 },
      { breakdown_type: "form_type", key: "mystery", count: 3 },
      { breakdown_type: "status", key: "bogus", count: 4 },
    ];
    const { byStatus, byType } = buildBreakdown(rows);
    expect(byType).toEqual({
      damage_report: 0,
      support_request: 0,
      return_checklist: 0,
    });
    expect(byStatus).toEqual({ new: 0, reviewed: 0, resolved: 0, archived: 0 });
  });

  it("returns all-zero maps for an empty result set", () => {
    const { byStatus, byType } = buildBreakdown([]);
    expect(Object.values(byStatus).every((n) => n === 0)).toBe(true);
    expect(Object.values(byType).every((n) => n === 0)).toBe(true);
  });
});
