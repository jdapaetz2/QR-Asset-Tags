import { describe, expect, it } from "vitest";

import { deriveAssetStatus } from "@/lib/ui/status-view";
import {
  buildAttentionItems,
  mergeRecentActivity,
  setupProgress,
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
    expect(items[0].href).toBe("/dashboard/submissions?asset_id=a1");
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
