import { describe, expect, it } from "vitest";

import { deriveAssetStatus } from "@/lib/ui/status-view";
import {
  buildAttentionItems,
  buildBandStats,
  mergeRecentActivity,
  nextOpenAccordionId,
  scanTrend,
  setupProgress,
  shouldShowSetupDetail,
  timeGreeting,
  type ActivityEvent,
  type AttentionAsset,
} from "./briefing";

const readyReadiness = deriveAssetStatus({
  rented: false,
  publicStatus: "public",
  qrStatus: "active",
  pageStatus: "published",
}).readiness;

const draftReadiness = deriveAssetStatus({
  rented: false,
  publicStatus: "public",
  qrStatus: "active",
  pageStatus: "draft",
}).readiness;

const noQrReadiness = deriveAssetStatus({
  rented: false,
  publicStatus: "public",
  qrStatus: null,
  pageStatus: "published",
}).readiness;

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
    readiness: readyReadiness,
    unresolvedCount: 0,
    hasOpenDamage: false,
  };

  it("emits a danger row for a rented asset with open damage", () => {
    const items = buildAttentionItems([
      { ...base, rented: true, hasOpenDamage: true, unresolvedCount: 2 },
    ]);
    expect(items[0].tone).toBe("danger");
    expect(items[0].href).toBe(
      "/dashboard/submissions?asset_id=a1&status=unresolved"
    );
  });

  it("emits a warning row for unresolved submissions", () => {
    const items = buildAttentionItems([{ ...base, unresolvedCount: 3 }]);
    expect(items[0].tone).toBe("warning");
    expect(items[0].title).toMatch(/3 open submissions/);
  });

  it("maps setup-gap reasons to the right fix link", () => {
    const draft = buildAttentionItems([{ ...base, id: "d", readiness: draftReadiness }]);
    expect(draft[0].href).toBe("/dashboard/assets/d/page");
    const noqr = buildAttentionItems([{ ...base, id: "q", readiness: noQrReadiness }]);
    expect(noqr[0].href).toBe("/dashboard/assets/q");
  });

  it("orders danger first, then unresolved by count desc, then setup gaps", () => {
    const items = buildAttentionItems([
      { ...base, id: "gap", readiness: draftReadiness },
      { ...base, id: "few", unresolvedCount: 1 },
      { ...base, id: "many", unresolvedCount: 5 },
      { ...base, id: "dmg", rented: true, hasOpenDamage: true },
    ]);
    expect(items.map((i) => i.assetId).slice(0, 3)).toEqual(["dmg", "many", "few"]);
    expect(items.at(-1)?.assetId).toBe("gap");
  });

  it("caps the number of items", () => {
    const many: AttentionAsset[] = Array.from({ length: 20 }, (_, i) => ({
      ...base,
      id: `x${i}`,
      unresolvedCount: 1,
    }));
    expect(buildAttentionItems(many, { cap: 5 })).toHaveLength(5);
  });

  it("shows nothing when all assets are ready and clean", () => {
    expect(buildAttentionItems([base])).toEqual([]);
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
    newCount: 3,
    scans7d: 186,
    rented: 4,
    ready: 11,
    totalAssets: 12,
  });

  it("returns the four ranked stats in order", () => {
    expect(stats.map((s) => s.key)).toEqual(["new", "scans", "rented", "ready"]);
  });

  it("every stat links to a filtered/analytics view (never inert)", () => {
    for (const s of stats) {
      expect(s.href).toBeTruthy();
      expect(s.href.startsWith("/dashboard/")).toBe(true);
    }
    expect(stats[0].href).toBe("/dashboard/submissions?status=new");
    expect(stats[1].href).toBe("/dashboard/analytics");
    expect(stats[2].href).toBe("/dashboard/assets?rental=rented");
    expect(stats[3].href).toBe("/dashboard/assets?page=published");
  });

  it("flags new-submissions as attention only when non-zero", () => {
    expect(stats[0].attention).toBe(true);
    const clear = buildBandStats({
      newCount: 0,
      scans7d: 142,
      rented: 6,
      ready: 12,
      totalAssets: 12,
    });
    expect(clear[0].attention).toBe(false);
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
