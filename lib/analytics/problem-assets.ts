/**
 * Problem-assets ranking for the analytics page — one consolidated module that
 * replaces the old "Most submissions / Most damage / Most support" lists. Pure +
 * tested; the page passes range-windowed submission rows and per-asset scan counts.
 * Ranked by open (unresolved) count, then total submissions, then scans, then code.
 */

import type { SubmissionRow } from "@/lib/analytics/activity";
import { UNRESOLVED_STATUSES, type AssetInfo } from "@/lib/analytics/insights";

export type ProblemAsset = {
  id: string;
  code: string;
  name: string;
  open: number; // unresolved (new + reviewed)
  total: number; // submissions in range
  damage: number;
  support: number;
  returns: number;
  scans: number; // scans in range
  reason: string;
};

function isUnresolved(status: string): boolean {
  return (UNRESOLVED_STATUSES as readonly string[]).includes(status);
}

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

export function buildProblemAssets(
  assets: AssetInfo[],
  submissions: SubmissionRow[],
  scanCountByAsset: Map<string, number>,
  limit = 6
): ProblemAsset[] {
  const known = new Map(assets.map((a) => [a.id, a]));
  const byId = new Map<string, ProblemAsset>();

  for (const sub of submissions) {
    const a = known.get(sub.asset_id);
    if (!a) continue; // ignore orphan/archived-asset submissions
    let e = byId.get(a.id);
    if (!e) {
      e = {
        id: a.id,
        code: a.asset_code,
        name: a.asset_name,
        open: 0,
        total: 0,
        damage: 0,
        support: 0,
        returns: 0,
        scans: scanCountByAsset.get(a.id) ?? 0,
        reason: "",
      };
      byId.set(a.id, e);
    }
    e.total += 1;
    if (isUnresolved(sub.status)) e.open += 1;
    if (sub.form_type === "damage_report") e.damage += 1;
    else if (sub.form_type === "support_request") e.support += 1;
    else if (sub.form_type === "return_checklist") e.returns += 1;
  }

  const rows = [...byId.values()];
  for (const r of rows) r.reason = reasonSummary(r);
  rows.sort(
    (a, b) =>
      b.open - a.open ||
      b.total - a.total ||
      b.scans - a.scans ||
      a.code.localeCompare(b.code)
  );
  return rows.slice(0, limit);
}
