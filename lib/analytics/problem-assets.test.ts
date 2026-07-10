import { describe, expect, it } from "vitest";

import { buildProblemAssets, reasonSummary } from "./problem-assets";
import type { AssetInfo } from "./insights";
import type { SubmissionRow } from "./activity";

const assets: AssetInfo[] = [
  { id: "a", asset_code: "EX-1", asset_name: "Excavator", category: "Excavator" },
  { id: "b", asset_code: "TR-2", asset_name: "Trailer", category: "Trailer" },
  { id: "c", asset_code: "GN-3", asset_name: "Generator", category: "Generator" },
];

const sub = (asset_id: string, form_type: string, status: string): SubmissionRow => ({
  asset_id,
  form_type,
  status,
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

describe("buildProblemAssets", () => {
  const submissions: SubmissionRow[] = [
    // a: 3 subs, 2 open (new+reviewed), 2 damage
    sub("a", "damage_report", "new"),
    sub("a", "damage_report", "reviewed"),
    sub("a", "support_request", "resolved"),
    // b: 2 subs, 2 open, 2 support
    sub("b", "support_request", "new"),
    sub("b", "support_request", "new"),
    // c: 1 sub, 0 open (resolved history)
    sub("c", "damage_report", "resolved"),
  ];
  const scans = new Map([
    ["a", 628],
    ["b", 59],
    ["c", 271],
  ]);

  it("ranks by open desc, then total, then scans, then code", () => {
    const rows = buildProblemAssets(assets, submissions, scans);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(rows[0]).toMatchObject({ open: 2, total: 3, damage: 2, scans: 628 });
    expect(rows[1]).toMatchObject({ open: 2, total: 2, support: 2, scans: 59 });
    expect(rows[2]).toMatchObject({ open: 0, total: 1, scans: 271 });
  });

  it("only includes assets with submissions and caps the list", () => {
    const rows = buildProblemAssets(assets, submissions, scans, 2);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.id === "c")).toBe(false);
  });

  it("ignores submissions for unknown assets", () => {
    const rows = buildProblemAssets(assets, [sub("zzz", "damage_report", "new")], scans);
    expect(rows).toHaveLength(0);
  });
});
