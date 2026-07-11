/**
 * Row shapes + pure mappers for the analytics aggregation RPCs
 * (supabase/migrations/0020_analytics_aggregation.sql). The page calls the
 * SECURITY INVOKER functions and maps their compact results into the existing chart
 * components — no raw scan_events / form_submissions rows are aggregated client-side.
 */

import {
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from "@/lib/submissions/display";
import {
  ANALYTICS_FORM_TYPES,
  type AnalyticsFormType,
} from "@/lib/analytics/activity";

/** analytics_daily_activity(p_days) → one row per yard-local day, zero-filled. */
export type DailyActivityRow = {
  day: string; // "YYYY-MM-DD" (yard-local)
  scan_count: number;
  new_submission_count: number;
};

/** analytics_scans_by_category(p_days). */
export type CategoryRow = { category: string; scan_count: number };

/** analytics_submission_breakdown(p_days) — status rows + form_type rows. */
export type BreakdownRow = {
  breakdown_type: "status" | "form_type" | string;
  key: string;
  count: number;
};

/** analytics_asset_activity(p_days) — one row per non-archived asset. */
export type AssetActivityRow = {
  asset_id: string;
  asset_code: string;
  asset_name: string;
  category: string | null;
  scan_count: number;
  last_scanned_at: string | null;
  submission_count: number;
  open_submission_count: number;
  damage_count: number;
  support_count: number;
  return_count: number;
};

/**
 * Fold the unified breakdown rows into the status + type maps the SubmissionsCard
 * expects. Missing keys stay 0; `pre_use_inspection` (not surfaced) is ignored.
 * bigint counts arrive as JS numbers — coerced defensively.
 */
export function buildBreakdown(rows: BreakdownRow[]): {
  byStatus: Record<SubmissionStatus, number>;
  byType: Record<AnalyticsFormType, number>;
} {
  const byStatus = SUBMISSION_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<SubmissionStatus, number>
  );
  const byType = ANALYTICS_FORM_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: 0 }),
    {} as Record<AnalyticsFormType, number>
  );

  for (const r of rows) {
    const n = Number(r.count) || 0;
    if (r.breakdown_type === "status" && r.key in byStatus) {
      byStatus[r.key as SubmissionStatus] = n;
    } else if (r.breakdown_type === "form_type" && r.key in byType) {
      byType[r.key as AnalyticsFormType] = n;
    }
  }
  return { byStatus, byType };
}
