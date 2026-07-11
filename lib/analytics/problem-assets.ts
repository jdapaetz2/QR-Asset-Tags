/**
 * Problem-assets ranking for the analytics page — one consolidated module that
 * replaces the old "Most submissions / Most damage / Most support" lists. Pure +
 * tested; the page passes rows from the `analytics_asset_activity` RPC. Ranked by
 * open (unresolved) count, then range submissions, then range scans, then code.
 */

import type { AssetActivityRow } from "@/lib/analytics/rpc";

export type ProblemAsset = {
  id: string;
  code: string;
  name: string;
  open: number; // current unresolved (new + reviewed) — all-time backlog
  total: number; // submissions in range
  damage: number;
  support: number;
  returns: number;
  scans: number; // scans in range
  reason: string;
};

/**
 * Short reason summary, e.g. "9 submissions · 7 damage · repeated reports",
 * "3 submissions · 2 damage", "2 submissions · 2 support requests". The secondary
 * clause prefers damage, then support, then returns; "repeated reports" is added
 * once total submissions reach 5.
 */
export function reasonSummary(r: {
  total: number;
  damage: number;
  support: number;
  returns: number;
}): string {
  const parts = [`${r.total} submission${r.total === 1 ? "" : "s"}`];
  if (r.damage > 0) parts.push(`${r.damage} damage`);
  else if (r.support > 0)
    parts.push(`${r.support} support request${r.support === 1 ? "" : "s"}`);
  else if (r.returns > 0)
    parts.push(`${r.returns} return checklist${r.returns === 1 ? "" : "s"}`);
  if (r.total >= 5) parts.push("repeated reports");
  return parts.join(" · ");
}

/**
 * Rank the per-asset activity rows into the Problem-assets module. An asset appears
 * when it has current open submissions OR any submissions in the range. Ordered by
 * open (current backlog) desc → range submissions desc → range scans desc → code.
 * When the range has no submissions but the asset has open backlog, the reason names
 * the backlog instead of "0 submissions".
 */
export function rankProblemAssets(
  rows: AssetActivityRow[],
  limit = 6
): ProblemAsset[] {
  const items: ProblemAsset[] = rows
    .filter((r) => r.open_submission_count > 0 || r.submission_count > 0)
    .map((r) => ({
      id: r.asset_id,
      code: r.asset_code,
      name: r.asset_name,
      open: r.open_submission_count,
      total: r.submission_count,
      damage: r.damage_count,
      support: r.support_count,
      returns: r.return_count,
      scans: r.scan_count,
      reason:
        r.submission_count > 0
          ? reasonSummary({
              total: r.submission_count,
              damage: r.damage_count,
              support: r.support_count,
              returns: r.return_count,
            })
          : `${r.open_submission_count} unresolved from earlier`,
    }));

  items.sort(
    (a, b) =>
      b.open - a.open ||
      b.total - a.total ||
      b.scans - a.scans ||
      a.code.localeCompare(b.code)
  );
  return items.slice(0, limit);
}
