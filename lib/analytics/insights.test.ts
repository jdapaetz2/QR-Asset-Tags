import { describe, expect, it } from "vitest";

import type { ScanRow, SubmissionRow } from "./activity";
import {
  INSIGHT_COPY,
  assetsCategoryHref,
  assetsNeedingAttention,
  scansByCategory,
  submissionsByCategory,
  submissionsHref,
  topAssets,
  type AssetInfo,
} from "./insights";

const assets: AssetInfo[] = [
  { id: "a1", asset_code: "EX-1", asset_name: "Excavator", category: "Excavators" },
  { id: "a2", asset_code: "TR-1", asset_name: "Trailer", category: "Trailers" },
  { id: "a3", asset_code: "GN-1", asset_name: "Generator", category: null },
];

function sub(
  asset_id: string,
  form_type: string,
  status: string
): SubmissionRow {
  return { asset_id, form_type, status };
}

describe("assetsNeedingAttention", () => {
  it("includes only unresolved/new-damage assets and excludes resolved/archived", () => {
    const submissions = [
      sub("a1", "damage_report", "new"),
      sub("a1", "support_request", "reviewed"),
      sub("a2", "support_request", "resolved"),
      sub("a3", "return_checklist", "archived"),
    ];
    const rows = assetsNeedingAttention(assets, submissions);
    expect(rows.map((r) => r.id)).toEqual(["a1"]);
    const a1 = rows[0];
    expect(a1.unresolved).toBe(2);
    expect(a1.newDamage).toBe(1);
    expect(a1.total).toBe(2);
    expect(a1.reasons).toContain("2 unresolved");
    expect(a1.reasons).toContain("1 new damage report");
    expect(a1.reasons).toContain("repeated submissions");
  });

  it("sorts by unresolved, then new damage, then total; respects the limit", () => {
    const submissions = [
      // a2: 3 unresolved
      sub("a2", "support_request", "new"),
      sub("a2", "support_request", "new"),
      sub("a2", "support_request", "reviewed"),
      // a1: 1 unresolved + 1 new damage
      sub("a1", "damage_report", "new"),
      // a3: 1 unresolved
      sub("a3", "support_request", "new"),
    ];
    const rows = assetsNeedingAttention(assets, submissions, 2);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("a2"); // most unresolved
    expect(rows[1].id).toBe("a1"); // ties on unresolved with a3, wins on new damage
  });

  it("ignores submissions for unknown/archived assets", () => {
    const rows = assetsNeedingAttention(assets, [
      sub("ghost", "damage_report", "new"),
    ]);
    expect(rows).toEqual([]);
  });
});

describe("topAssets", () => {
  const submissions = [
    sub("a1", "damage_report", "new"),
    sub("a1", "damage_report", "resolved"),
    sub("a1", "support_request", "new"),
    sub("a2", "support_request", "new"),
    sub("a2", "support_request", "reviewed"),
  ];

  it("ranks by total submissions desc", () => {
    const rows = topAssets(assets, submissions);
    expect(rows.map((r) => [r.id, r.count])).toEqual([
      ["a1", 3],
      ["a2", 2],
    ]);
  });

  it("filters by form type", () => {
    const damage = topAssets(assets, submissions, { formType: "damage_report" });
    expect(damage).toEqual([
      { id: "a1", code: "EX-1", name: "Excavator", count: 2 },
    ]);
    const support = topAssets(assets, submissions, {
      formType: "support_request",
    });
    expect(support.map((r) => r.id)).toEqual(["a2", "a1"]);
  });

  it("respects the limit and drops zero counts", () => {
    expect(topAssets(assets, submissions, { limit: 1 })).toHaveLength(1);
    expect(topAssets(assets, [])).toEqual([]);
  });
});

describe("category grouping", () => {
  it("groups submissions by category with an Uncategorized bucket, sorted desc", () => {
    const rows = submissionsByCategory(assets, [
      sub("a1", "damage_report", "new"),
      sub("a1", "support_request", "new"),
      sub("a3", "return_checklist", "new"),
    ]);
    expect(rows).toEqual([
      { category: "Excavators", count: 2 },
      { category: "Uncategorized", count: 1 },
    ]);
  });

  it("groups scans by category", () => {
    const scans: ScanRow[] = [
      { asset_id: "a2", scanned_at: "2026-06-01T00:00:00Z" },
      { asset_id: "a2", scanned_at: "2026-06-02T00:00:00Z" },
      { asset_id: "a1", scanned_at: "2026-06-03T00:00:00Z" },
    ];
    expect(scansByCategory(assets, scans)).toEqual([
      { category: "Trailers", count: 2 },
      { category: "Excavators", count: 1 },
    ]);
  });
});

describe("safe drill-through links", () => {
  it("builds encoded submissions links", () => {
    expect(submissionsHref({ assetId: "a1" })).toBe(
      "/dashboard/submissions?asset_id=a1"
    );
    expect(
      submissionsHref({ assetId: "a1", formType: "damage_report" })
    ).toBe("/dashboard/submissions?asset_id=a1&form_type=damage_report");
    expect(submissionsHref({})).toBe("/dashboard/submissions");
  });

  it("encodes special characters so links can't break", () => {
    expect(submissionsHref({ assetId: "a&b c" })).toBe(
      "/dashboard/submissions?asset_id=a%26b+c"
    );
    expect(assetsCategoryHref("Test & Measurement")).toBe(
      "/dashboard/assets?category=Test+%26+Measurement"
    );
  });
});

describe("INSIGHT_COPY", () => {
  it("hedges interpretation (no overclaiming of causation)", () => {
    expect(INSIGHT_COPY.topScanned).toMatch(/may/i);
    expect(INSIGHT_COPY.repeatedDamage).toMatch(/may/i);
    expect(INSIGHT_COPY.categoryLoad).toMatch(/may/i);
  });
});
