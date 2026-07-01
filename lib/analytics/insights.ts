/**
 * Pure operational-insight aggregation for the analytics page. No I/O — the page
 * fetches RLS-scoped rows and passes them here, so the logic is unit-tested and the
 * query layer stays thin.
 *
 * Privacy: like `activity.ts`, callers select only the fields on `ScanRow` /
 * `SubmissionRow` / `AssetInfo`. Nothing here consumes `ip_hash`, `user_agent`, or
 * `referrer`, and no submission contents — counts + asset metadata only.
 */

import type { ScanRow, SubmissionRow } from "@/lib/analytics/activity";

export type AssetInfo = {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string | null;
};

/** Statuses that still need operator action (resolved/archived are "done"). */
export const UNRESOLVED_STATUSES = ["new", "reviewed"] as const;

function isUnresolved(status: string): boolean {
  return (UNRESOLVED_STATUSES as readonly string[]).includes(status);
}

const UNCATEGORIZED = "Uncategorized";

function categoryLabel(category: string | null): string {
  const trimmed = (category ?? "").trim();
  return trimmed.length === 0 ? UNCATEGORIZED : trimmed;
}

export type AttentionAsset = {
  id: string;
  code: string;
  name: string;
  unresolved: number;
  newDamage: number;
  total: number;
  reasons: string[];
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Assets that likely need operator attention: those with unresolved submissions
 * (new/reviewed) or new damage reports. Sorted unresolved → new damage → total
 * (all descending), then limited. `reasons` are short, explainable labels.
 */
export function assetsNeedingAttention(
  assets: AssetInfo[],
  submissions: SubmissionRow[],
  limit = 5
): AttentionAsset[] {
  const byId = new Map<string, AttentionAsset>();
  const known = new Map(assets.map((a) => [a.id, a]));

  for (const sub of submissions) {
    const asset = known.get(sub.asset_id);
    if (!asset) continue; // ignore orphan/archived-asset submissions
    let entry = byId.get(asset.id);
    if (!entry) {
      entry = {
        id: asset.id,
        code: asset.asset_code,
        name: asset.asset_name,
        unresolved: 0,
        newDamage: 0,
        total: 0,
        reasons: [],
      };
      byId.set(asset.id, entry);
    }
    entry.total += 1;
    if (isUnresolved(sub.status)) entry.unresolved += 1;
    if (sub.form_type === "damage_report" && sub.status === "new") {
      entry.newDamage += 1;
    }
  }

  const rows = [...byId.values()].filter(
    (r) => r.unresolved > 0 || r.newDamage > 0
  );

  for (const r of rows) {
    // "unresolved" is an adjective — don't pluralize it ("2 unresolved").
    if (r.unresolved > 0) r.reasons.push(`${r.unresolved} unresolved`);
    if (r.newDamage > 0) r.reasons.push(plural(r.newDamage, "new damage report"));
    if (r.total >= 2) r.reasons.push("repeated submissions");
  }

  rows.sort(
    (a, b) =>
      b.unresolved - a.unresolved ||
      b.newDamage - a.newDamage ||
      b.total - a.total
  );
  return rows.slice(0, limit);
}

export type TopAsset = {
  id: string;
  code: string;
  name: string;
  count: number;
};

/**
 * Top assets by submission volume, optionally restricted to one form type. Only
 * assets with count > 0, descending, limited to `limit`.
 */
export function topAssets(
  assets: AssetInfo[],
  submissions: SubmissionRow[],
  options: { formType?: string; limit?: number } = {}
): TopAsset[] {
  const { formType, limit = 5 } = options;
  const known = new Map(assets.map((a) => [a.id, a]));
  const counts = new Map<string, number>();

  for (const sub of submissions) {
    if (formType && sub.form_type !== formType) continue;
    if (!known.has(sub.asset_id)) continue;
    counts.set(sub.asset_id, (counts.get(sub.asset_id) ?? 0) + 1);
  }

  const rows: TopAsset[] = [];
  for (const [id, count] of counts) {
    if (count <= 0) continue;
    const a = known.get(id)!;
    rows.push({ id, code: a.asset_code, name: a.asset_name, count });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, limit);
}

export type CategoryCount = { category: string; count: number };

function groupByCategory(
  assets: AssetInfo[],
  assetIds: string[]
): CategoryCount[] {
  const categoryOf = new Map(
    assets.map((a) => [a.id, categoryLabel(a.category)])
  );
  const counts = new Map<string, number>();
  for (const id of assetIds) {
    const label = categoryOf.get(id);
    if (!label) continue; // asset not in this org's set
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const rows = [...counts.entries()].map(([category, count]) => ({
    category,
    count,
  }));
  rows.sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return rows;
}

/** Submissions grouped by the submitting asset's category (desc). */
export function submissionsByCategory(
  assets: AssetInfo[],
  submissions: SubmissionRow[]
): CategoryCount[] {
  return groupByCategory(
    assets,
    submissions.map((s) => s.asset_id)
  );
}

/** Scans grouped by the scanned asset's category (desc). */
export function scansByCategory(
  assets: AssetInfo[],
  scans: ScanRow[]
): CategoryCount[] {
  return groupByCategory(
    assets,
    scans.map((s) => s.asset_id)
  );
}

/**
 * Safe drill-through link to the submissions inbox. Values are URL-encoded via
 * URLSearchParams, so asset ids / form types can't break the query string.
 */
export function submissionsHref(params: {
  assetId?: string;
  formType?: string;
  status?: string;
}): string {
  const qs = new URLSearchParams();
  if (params.assetId) qs.set("asset_id", params.assetId);
  if (params.formType) qs.set("form_type", params.formType);
  if (params.status) qs.set("status", params.status);
  const s = qs.toString();
  return `/dashboard/submissions${s ? `?${s}` : ""}`;
}

/** Safe drill-through to the assets list filtered by category. */
export function assetsCategoryHref(category: string): string {
  const qs = new URLSearchParams({ category });
  return `/dashboard/assets?${qs.toString()}`;
}

/**
 * Plain-language interpretation hints. Deliberately hedged ("may") — these describe
 * possibilities, not causes, so the operator investigates rather than assumes.
 */
export const INSIGHT_COPY = {
  needsAttention:
    "Unresolved submissions should be reviewed before the asset rents again.",
  topScanned:
    "High scans may indicate customers need help with this asset — check its instructions and documents.",
  repeatedDamage:
    "Repeated damage reports may indicate misuse, unclear instructions, or a maintenance issue.",
  categoryLoad:
    "Categories with the most activity may need better documentation or closer inspection.",
} as const;
