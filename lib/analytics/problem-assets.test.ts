import { describe, expect, it } from "vitest";

import { rankProblemAssets, reasonSummary } from "./problem-assets";
import type { AssetActivityRow } from "./rpc";

const row = (
  over: Partial<AssetActivityRow> & Pick<AssetActivityRow, "asset_id" | "asset_code">
): AssetActivityRow => ({
  asset_name: over.asset_code,
  category: null,
  scan_count: 0,
  last_scanned_at: null,
  submission_count: 0,
  open_submission_count: 0,
  damage_count: 0,
  support_count: 0,
  return_count: 0,
  ...over,
});

describe("reasonSummary", () => {
  it("prefers damage, then support, then returns, and flags repeats at 5+", () => {
    expect(reasonSummary({ total: 9, damage: 7, support: 0, returns: 0 })).toBe(
      "9 submissions · 7 damage · repeated reports"
    );
    expect(reasonSummary({ total: 3, damage: 2, support: 1, returns: 0 })).toBe(
      "3 submissions · 2 damage"
    );
    expect(reasonSummary({ total: 2, damage: 0, support: 2, returns: 0 })).toBe(
      "2 submissions · 2 support requests"
    );
    expect(reasonSummary({ total: 1, damage: 0, support: 0, returns: 1 })).toBe(
      "1 submission · 1 return checklist"
    );
  });
});

describe("rankProblemAssets", () => {
  const rows: AssetActivityRow[] = [
    // a: 3 subs, 2 open (new+reviewed), 2 damage, 628 scans
    row({
      asset_id: "a",
      asset_code: "EX-1",
      asset_name: "Excavator",
      scan_count: 628,
      submission_count: 3,
      open_submission_count: 2,
      damage_count: 2,
    }),
    // b: 2 subs, 2 open, 2 support, 59 scans
    row({
      asset_id: "b",
      asset_code: "TR-2",
      asset_name: "Trailer",
      scan_count: 59,
      submission_count: 2,
      open_submission_count: 2,
      support_count: 2,
    }),
    // c: 1 sub, 0 open (resolved history), 271 scans
    row({
      asset_id: "c",
      asset_code: "GN-3",
      asset_name: "Generator",
      scan_count: 271,
      submission_count: 1,
    }),
  ];

  it("ranks by open desc, then total, then scans, then code", () => {
    const ranked = rankProblemAssets(rows);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(ranked[0]).toMatchObject({ open: 2, total: 3, damage: 2, scans: 628 });
    expect(ranked[1]).toMatchObject({ open: 2, total: 2, support: 2, scans: 59 });
    expect(ranked[2]).toMatchObject({ open: 0, total: 1, scans: 271 });
  });

  it("only includes assets with open backlog or range submissions, and caps the list", () => {
    const ranked = rankProblemAssets(rows, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked.some((r) => r.id === "c")).toBe(false);
  });

  it("excludes assets with no open backlog and no range submissions", () => {
    const quiet = row({ asset_id: "z", asset_code: "QZ-9", scan_count: 400 });
    expect(rankProblemAssets([quiet])).toHaveLength(0);
  });

  it("names the backlog when the range has open items but no submissions", () => {
    const backlog = row({
      asset_id: "d",
      asset_code: "DR-4",
      asset_name: "Drill",
      submission_count: 0,
      open_submission_count: 3,
    });
    const ranked = rankProblemAssets([backlog]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].reason).toBe("3 unresolved from earlier");
  });
});
