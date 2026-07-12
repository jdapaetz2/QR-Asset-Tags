import { describe, expect, it } from "vitest";

import {
  buildAttentionItems,
  buildBandStats,
  buildSetupGaps,
  coverageStatus,
  DASHBOARD_SECTION_ORDER,
  mergeRecentActivity,
  nextOpenAccordionId,
  rollupScanEvents,
  scanTrend,
  setupProgress,
  shouldShowSetupDetail,
  summarizeUnresolvedByAsset,
  timeGreeting,
  type ActivityEvent,
  type AttentionAsset,
} from "./briefing";

const DAY = 86_400_000;

describe("setupProgress", () => {
  it("counts ready over total", () => {
    expect(setupProgress([{ ready: true }, { ready: false }, { ready: true }])).toEqual({
      ready: 2,
      total: 3,
      complete: false,
    });
  });

  it("is complete only when all assets are ready (hidden at 100%)", () => {
    expect(setupProgress([{ ready: true }, { ready: true }]).complete).toBe(true);
  });

  it("reappears (complete=false) when any asset is unready", () => {
    expect(setupProgress([{ ready: true }, { ready: false }]).complete).toBe(false);
  });

  it("is not complete with zero assets", () => {
    expect(setupProgress([])).toEqual({ ready: 0, total: 0, complete: false });
  });
});

describe("buildAttentionItems", () => {
  const base: AttentionAsset = {
    id: "a1",
    code: "EX-1",
    name: "Excavator 1",
    rented: false,
    unresolvedCount: 0,
    hasOpenDamage: false,
    hasUrgentDamage: false,
    hasUnresolvedReturn: false,
    returnSubmissionId: null,
    returnFlagsIssue: false,
    oldestUnresolvedMs: null,
    newestUnresolvedMs: null,
  };

  it("emits a danger row for a rented asset with open damage", () => {
    const items = buildAttentionItems([
      { ...base, rented: true, hasOpenDamage: true, unresolvedCount: 2 },
    ]);
    expect(items[0].tone).toBe("danger");
    expect(items[0].key).toContain(":damage-rented");
    expect(items[0].href).toBe(
      "/dashboard/submissions?asset_id=a1&status=unresolved"
    );
  });

  it("emits a danger row for an available asset with open damage", () => {
    const items = buildAttentionItems([
      { ...base, hasOpenDamage: true, unresolvedCount: 1 },
    ]);
    expect(items[0].tone).toBe("danger");
    expect(items[0].key).toContain(":damage-available");
  });

  it("emits a warning row for unresolved submissions", () => {
    const items = buildAttentionItems([{ ...base, unresolvedCount: 3 }]);
    expect(items[0].tone).toBe("warning");
    expect(items[0].title).toMatch(/3 open submissions/);
  });

  it("carries returnSubmissionId on a return-while-rented row (the quick action)", () => {
    const [item] = buildAttentionItems([
      {
        ...base,
        rented: true,
        unresolvedCount: 1,
        hasUnresolvedReturn: true,
        returnSubmissionId: "sub-9",
      },
    ]);
    expect(item.key).toContain(":return-rented");
    expect(item.returnSubmissionId).toBe("sub-9");
    expect(item.tone).toBe("warning");
  });

  it("flags a stale unresolved item when the oldest is over 24h", () => {
    const now = 100 * DAY;
    const items = buildAttentionItems(
      [{ ...base, unresolvedCount: 1, oldestUnresolvedMs: now - 2 * DAY }],
      { now }
    );
    expect(items[0].key).toContain(":stale");
  });

  it("orders by severity: damage-rented, damage-available, return-rented, multi, unresolved", () => {
    const now = 10 * DAY;
    const items = buildAttentionItems(
      [
        { ...base, id: "few", unresolvedCount: 1, oldestUnresolvedMs: now },
        {
          ...base,
          id: "ret",
          rented: true,
          unresolvedCount: 1,
          hasUnresolvedReturn: true,
          returnSubmissionId: "s-ret",
          oldestUnresolvedMs: now,
        },
        { ...base, id: "davail", hasOpenDamage: true, unresolvedCount: 1 },
        { ...base, id: "drent", rented: true, hasOpenDamage: true, unresolvedCount: 1 },
        { ...base, id: "multi", rented: true, unresolvedCount: 3, oldestUnresolvedMs: now },
      ],
      { now }
    );
    expect(items.map((i) => i.assetId)).toEqual([
      "drent",
      "davail",
      "ret",
      "multi",
      "few",
    ]);
  });

  it("does NOT cap by default — every qualifying asset is surfaced", () => {
    const many: AttentionAsset[] = Array.from({ length: 20 }, (_, i) => ({
      ...base,
      id: `x${i}`,
      unresolvedCount: 1,
    }));
    expect(buildAttentionItems(many)).toHaveLength(20);
    // A caller may still opt into a cap (e.g. a compact widget).
    expect(buildAttentionItems(many, { cap: 5 })).toHaveLength(5);
  });

  it("within a priority, older unresolved work sorts first", () => {
    const now = 10 * DAY;
    const items = buildAttentionItems(
      [
        { ...base, id: "newer", unresolvedCount: 1, oldestUnresolvedMs: now - 1 * DAY },
        { ...base, id: "older", unresolvedCount: 1, oldestUnresolvedMs: now - 5 * DAY },
      ],
      { now }
    );
    // Both are priority-6 "stale"; the older asset leads.
    expect(items.map((i) => i.assetId)).toEqual(["older", "newer"]);
  });

  it("shows nothing for a clean asset (no unresolved work)", () => {
    expect(buildAttentionItems([base])).toEqual([]);
  });
});

describe("summarizeUnresolvedByAsset", () => {
  it("rolls up damage/urgency/return/oldest; ignores resolved + unlinked rows", () => {
    const map = summarizeUnresolvedByAsset([
      {
        id: "d1",
        asset_id: "a",
        form_type: "damage_report",
        status: "new",
        created_at: "2026-07-02T00:00:00Z",
        submission_data_json: { urgency: "high" },
      },
      {
        id: "r1",
        asset_id: "a",
        form_type: "return_checklist",
        status: "reviewed",
        created_at: "2026-07-01T00:00:00Z",
        submission_data_json: { damage_observed: "yes" },
      },
      {
        id: "x1",
        asset_id: "a",
        form_type: "support_request",
        status: "resolved", // ignored (not unresolved)
        created_at: "2026-07-03T00:00:00Z",
      },
      {
        id: "u1",
        asset_id: null, // ignored (no asset)
        form_type: "damage_report",
        status: "new",
        created_at: "2026-07-03T00:00:00Z",
      },
    ]);
    const a = map.get("a");
    expect(a?.unresolvedCount).toBe(2);
    expect(a?.hasOpenDamage).toBe(true);
    expect(a?.hasUrgentDamage).toBe(true);
    expect(a?.hasUnresolvedReturn).toBe(true);
    expect(a?.returnSubmissionId).toBe("r1");
    expect(a?.returnFlagsIssue).toBe(true);
    expect(a?.oldestUnresolvedMs).toBe(Date.parse("2026-07-01T00:00:00Z"));
    expect(a?.newestUnresolvedMs).toBe(Date.parse("2026-07-02T00:00:00Z"));
  });

  it("does not flag a clean return checklist as an issue", () => {
    const map = summarizeUnresolvedByAsset([
      {
        id: "r1",
        asset_id: "a",
        form_type: "return_checklist",
        status: "new",
        created_at: "2026-07-01T00:00:00Z",
        submission_data_json: { damage_observed: "no", accessories_returned: "yes" },
      },
    ]);
    expect(map.get("a")?.returnFlagsIssue).toBe(false);
    expect(map.get("a")?.hasUnresolvedReturn).toBe(true);
  });
});

describe("buildSetupGaps", () => {
  it("lists only not-ready assets with a reason and maps the fix link", () => {
    const gaps = buildSetupGaps([
      { id: "ok", code: "OK", name: "Ready one", ready: true, reason: null },
      { id: "d", code: "D", name: "Draft page", ready: false, reason: "page_draft" },
      { id: "q", code: "Q", name: "No QR", ready: false, reason: "missing_qr" },
    ]);
    expect(gaps.map((g) => g.id)).toEqual(["d", "q"]);
    expect(gaps[0].href).toBe("/dashboard/assets/d/page");
    expect(gaps[1].href).toBe("/dashboard/assets/q");
    expect(gaps[0].title).toBe("Equipment page is a draft");
  });

  it("caps to the limit", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `a${i}`,
      code: `A${i}`,
      name: "x",
      ready: false,
      reason: "missing_qr" as const,
    }));
    expect(buildSetupGaps(many, 2)).toHaveLength(2);
  });
});

describe("mergeRecentActivity", () => {
  const ev = (at: string, label: string): ActivityEvent => ({ kind: "scan", at, label });

  it("sorts newest-first and caps to the limit", () => {
    const out = mergeRecentActivity(
      [
        ev("2026-07-01T00:00:00Z", "old"),
        ev("2026-07-09T00:00:00Z", "new"),
        ev("2026-07-05T00:00:00Z", "mid"),
      ],
      2
    );
    expect(out.map((e) => e.label)).toEqual(["new", "mid"]);
  });
});

describe("buildBandStats", () => {
  const stats = buildBandStats({
    rented: 4,
    unresolved: 3,
    scans7d: 186,
    ready: 11,
    totalAssets: 12,
  });

  it("returns the operational pulse in order: rented, unresolved, scans, assets ready", () => {
    expect(stats.map((s) => s.key)).toEqual([
      "rented",
      "unresolved",
      "scans",
      "ready",
    ]);
    // The commercial "covered" number is not an operational band stat.
    expect(stats.some((s) => s.key === "covered")).toBe(false);
  });

  it("shows assets ready / total, sourced from the same readiness value as Setup", () => {
    const progress = setupProgress([
      { ready: true },
      { ready: true },
      { ready: false },
    ]);
    const s = buildBandStats({
      rented: 1,
      unresolved: 0,
      scans7d: 0,
      ready: progress.ready,
      totalAssets: progress.total,
    });
    const readyStat = s.find((x) => x.key === "ready");
    expect(readyStat?.label).toBe("assets ready");
    expect(readyStat?.value).toBe(2);
    expect(readyStat?.total).toBe(3);
    expect(readyStat?.href).toBe("/dashboard/assets");
  });

  it("every stat links to a filtered/analytics view (never inert)", () => {
    for (const s of stats) {
      expect(s.href).toBeTruthy();
      expect(s.href.startsWith("/dashboard/")).toBe(true);
    }
    expect(stats[0].href).toBe("/dashboard/assets?rental=rented");
    expect(stats[1].href).toBe("/dashboard/submissions");
    expect(stats[2].href).toBe("/dashboard/analytics");
    expect(stats[3].href).toBe("/dashboard/assets");
  });

  it("flags unresolved as attention only when non-zero", () => {
    expect(stats[1].attention).toBe(true);
    const clear = buildBandStats({
      rented: 6,
      unresolved: 0,
      scans7d: 142,
      ready: 12,
      totalAssets: 12,
    });
    expect(clear[1].attention).toBe(false);
  });
});

describe("coverageStatus", () => {
  it("is null when there is no plan cap or usage is comfortably under it", () => {
    expect(coverageStatus(9, null)).toBeNull();
    expect(coverageStatus(0, 0)).toBeNull();
    expect(coverageStatus(5, 12)).toBeNull(); // 42%
    expect(coverageStatus(9, 12)).toBeNull(); // 75%
  });

  it("warns at ≥80% and flags over at ≥100%", () => {
    expect(coverageStatus(10, 12)).toEqual({ pct: 83, level: "warn" });
    expect(coverageStatus(12, 12)).toEqual({ pct: 100, level: "over" });
    expect(coverageStatus(15, 12)).toEqual({ pct: 125, level: "over" });
  });
});

describe("DASHBOARD_SECTION_ORDER", () => {
  it("places Captured (proof of value) right after the attention queue, Setup last", () => {
    expect(DASHBOARD_SECTION_ORDER).toEqual([
      "attention",
      "captured",
      "activity",
      "setup",
    ]);
  });
});

describe("shouldShowSetupDetail", () => {
  it("shows below 100% ready, hides at 100% and at zero assets", () => {
    expect(shouldShowSetupDetail({ ready: 11, total: 12, complete: false })).toBe(true);
    expect(shouldShowSetupDetail({ ready: 12, total: 12, complete: true })).toBe(false);
    expect(shouldShowSetupDetail({ ready: 0, total: 0, complete: false })).toBe(false);
  });
});

describe("scanTrend", () => {
  const now = Date.parse("2026-07-09T12:00:00Z");
  const day = 86_400_000;

  it("buckets by day, oldest-first with the current day last", () => {
    const events = [
      { scanned_at: new Date(now).toISOString() }, // today
      { scanned_at: new Date(now).toISOString() }, // today
      { scanned_at: new Date(now - day).toISOString() }, // yesterday
      { scanned_at: new Date(now - 6 * day).toISOString() }, // 6 days ago (oldest in window)
      { scanned_at: new Date(now - 9 * day).toISOString() }, // outside 7d
      { scanned_at: null },
      { scanned_at: "not-a-date" },
    ];
    const trend = scanTrend(events, 7, now);
    expect(trend).toHaveLength(7);
    expect(trend[6]).toBe(2); // today
    expect(trend[5]).toBe(1); // yesterday
    expect(trend[0]).toBe(1); // 6 days ago
    expect(trend.reduce((a, b) => a + b, 0)).toBe(4); // out-of-window + invalids dropped
  });
});

describe("nextOpenAccordionId", () => {
  it("opens a closed item and collapses others (single-open)", () => {
    expect(nextOpenAccordionId(null, "a")).toBe("a");
    expect(nextOpenAccordionId("a", "b")).toBe("b");
  });

  it("toggles the open item closed", () => {
    expect(nextOpenAccordionId("a", "a")).toBeNull();
  });
});

describe("timeGreeting", () => {
  it("maps the hour to a greeting", () => {
    expect(timeGreeting(8)).toBe("Good morning");
    expect(timeGreeting(14)).toBe("Good afternoon");
    expect(timeGreeting(20)).toBe("Good evening");
  });
});

describe("rollupScanEvents", () => {
  const day = 86_400_000;
  const t0 = Date.parse("2026-07-09T15:00:00Z");

  it("groups scans by asset per day and keeps the latest time + count", () => {
    const rollups = rollupScanEvents([
      { asset_id: "a", scanned_at: new Date(t0).toISOString() },
      { asset_id: "a", scanned_at: new Date(t0 - 3 * 3_600_000).toISOString() }, // same day
      { asset_id: "a", scanned_at: new Date(t0 - day).toISOString() }, // prior day
      { asset_id: "b", scanned_at: new Date(t0).toISOString() },
      { asset_id: null, scanned_at: new Date(t0).toISOString() }, // dropped
      { asset_id: "a", scanned_at: "not-a-date" }, // dropped
    ]);
    // a-today (2), b-today (1), a-yesterday (1)
    expect(rollups).toHaveLength(3);
    const aToday = rollups.find((r) => r.assetId === "a" && r.at === new Date(t0).toISOString());
    expect(aToday?.count).toBe(2);
    // newest-first
    expect(new Date(rollups[0].at).getTime()).toBeGreaterThanOrEqual(
      new Date(rollups[rollups.length - 1].at).getTime()
    );
  });
});
