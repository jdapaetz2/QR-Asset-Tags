/**
 * Pure, authoritative definition of OPEN DAMAGE for an asset (Phase 3C). No I/O. One place decides what
 * counts as unresolved damage so the Assets list, the asset-detail alert, the timeline, and the filtered
 * submissions view all agree.
 *
 * An open damage item is an org-owned submission with status new/reviewed AND either:
 *   1. form_type = 'damage_report', or
 *   2. form_type = 'return_checklist' whose canonical damage flag is set (V1 or V2, renter or staff).
 * Resolved/archived, the outbound baseline ('pre_use_inspection'), and support requests never count.
 * Missing accessories are a separate concern and are NOT open damage.
 */
import { returnChecklistFlags } from "@/lib/submissions/returns";

/** Shared select for the damage columns (extends the existing unresolved-submissions query). */
export const OPEN_DAMAGE_COLUMNS =
  "id, asset_id, created_at, form_type, submission_origin, status, submission_data_json";

export type OpenDamageRow = {
  id: string;
  asset_id: string | null;
  created_at: string;
  form_type: string;
  submission_origin: string | null;
  status: string;
  submission_data_json: unknown;
};

const OPEN_STATUSES = new Set(["new", "reviewed"]);

/** Whether a submission row is an OPEN damage item per the authoritative definition above. */
export function isOpenDamageRow(row: {
  form_type: string;
  status: string;
  submission_data_json: unknown;
}): boolean {
  if (!OPEN_STATUSES.has(row.status)) return false;
  if (row.form_type === "damage_report") return true;
  if (row.form_type === "return_checklist") {
    return returnChecklistFlags(row.submission_data_json).damage;
  }
  // pre_use_inspection (outbound baseline), support_request, anything else → not open damage.
  return false;
}

function cap(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * Human severity label for a damage item, or null when unknown. A V2 return carries
 * `answers.values.damage_severity` (minor/moderate/severe); a damage_report carries `urgency`
 * (low/medium/high). V1 returns have no structured severity.
 */
export function damageSeverityLabel(row: {
  form_type: string;
  submission_data_json: unknown;
}): string | null {
  const data =
    row.submission_data_json && typeof row.submission_data_json === "object"
      ? (row.submission_data_json as Record<string, unknown>)
      : {};
  if (row.form_type === "damage_report") {
    const u = data.urgency;
    return typeof u === "string" && u.trim() ? cap(u.trim()) : null;
  }
  if (row.form_type === "return_checklist") {
    const answers = data.answers as { values?: Record<string, unknown> } | undefined;
    const sev = answers?.values?.damage_severity;
    return typeof sev === "string" && sev.trim() ? cap(sev.trim()) : null;
  }
  return null;
}

export type OpenDamageLatest = {
  id: string;
  createdAt: string;
  formType: string;
  origin: string | null;
  severity: string | null;
};

export type OpenDamageSummary = {
  assetId: string;
  count: number;
  latest: OpenDamageLatest;
};

/**
 * Group open-damage rows by asset → count + latest item (newest created_at). Rows that are not open damage
 * (or have no asset) are skipped, so an asset with no open damage simply has no entry in the map.
 */
export function openDamageSummaryByAsset(
  rows: OpenDamageRow[]
): Map<string, OpenDamageSummary> {
  const byAsset = new Map<string, OpenDamageSummary>();
  for (const row of rows) {
    if (!row.asset_id || !isOpenDamageRow(row)) continue;
    const existing = byAsset.get(row.asset_id);
    const isNewer = !existing || row.created_at > existing.latest.createdAt;
    const latest: OpenDamageLatest = isNewer
      ? {
          id: row.id,
          createdAt: row.created_at,
          formType: row.form_type,
          origin: row.submission_origin,
          severity: damageSeverityLabel(row),
        }
      : existing.latest;
    byAsset.set(row.asset_id, {
      assetId: row.asset_id,
      count: (existing?.count ?? 0) + 1,
      latest,
    });
  }
  return byAsset;
}

/** Filtered submissions view for an asset's open damage (used by list badge, alert, and cross-links). */
export function openDamageHref(assetId: string): string {
  return `/dashboard/submissions?attention=damage&asset_id=${assetId}&status=unresolved`;
}
