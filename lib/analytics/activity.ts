/**
 * Pure activity-analytics aggregation for the admin dashboard. No I/O — the page
 * fetches RLS-scoped rows and passes them here, so the math is unit-tested and
 * the query layer stays thin.
 *
 * Privacy: callers select only the fields below. Scan rows never carry `ip_hash`,
 * `user_agent`, or `referrer`; submission rows never carry contents — counts only.
 */

import {
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from "@/lib/submissions/display";

export type ScanRow = { asset_id: string; scanned_at: string };
export type SubmissionRow = {
  asset_id: string;
  form_type: string;
  status: string;
};

/** Submission types surfaced on the analytics overview. */
export const ANALYTICS_FORM_TYPES = [
  "damage_report",
  "support_request",
  "return_checklist",
] as const;
export type AnalyticsFormType = (typeof ANALYTICS_FORM_TYPES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export type ActivitySummary = {
  totalScans: number;
  scans7d: number;
  scans30d: number;
  totalSubmissions: number;
  newSubmissions: number;
  byType: Record<AnalyticsFormType, number>;
  byStatus: Record<SubmissionStatus, number>;
};

function emptyByType(): Record<AnalyticsFormType, number> {
  return ANALYTICS_FORM_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: 0 }),
    {} as Record<AnalyticsFormType, number>
  );
}

function emptyByStatus(): Record<SubmissionStatus, number> {
  return SUBMISSION_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<SubmissionStatus, number>
  );
}

/**
 * Overview counts. `now` is injected so the 7/30-day windows are testable. A scan
 * counts toward a window when `scanned_at >= now − Ndays` (invalid dates ignored).
 */
export function summarizeActivity(
  scans: ScanRow[],
  submissions: SubmissionRow[],
  now: Date = new Date()
): ActivitySummary {
  const nowMs = now.getTime();
  const cutoff7 = nowMs - 7 * DAY_MS;
  const cutoff30 = nowMs - 30 * DAY_MS;

  let scans7d = 0;
  let scans30d = 0;
  for (const s of scans) {
    const t = new Date(s.scanned_at).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= cutoff7) scans7d += 1;
    if (t >= cutoff30) scans30d += 1;
  }

  const byType = emptyByType();
  const byStatus = emptyByStatus();
  let newSubmissions = 0;
  for (const sub of submissions) {
    if ((ANALYTICS_FORM_TYPES as readonly string[]).includes(sub.form_type)) {
      byType[sub.form_type as AnalyticsFormType] += 1;
    }
    if ((SUBMISSION_STATUSES as readonly string[]).includes(sub.status)) {
      byStatus[sub.status as SubmissionStatus] += 1;
    }
    if (sub.status === "new") newSubmissions += 1;
  }

  return {
    totalScans: scans.length,
    scans7d,
    scans30d,
    totalSubmissions: submissions.length,
    newSubmissions,
    byType,
    byStatus,
  };
}

export type AssetActivity = {
  totalScans: number;
  lastScannedAt: string | null;
  submissionCount: number;
};

/** Sort options for the per-asset activity table (most-active-first variants). */
export const ASSET_SORTS = [
  "scans_desc",
  "submissions_desc",
  "last_scanned_desc",
] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

/** Validate a `sort` query param; anything unknown/missing falls back safely. */
export function normalizeAssetSort(value: unknown): AssetSort {
  return typeof value === "string" &&
    (ASSET_SORTS as readonly string[]).includes(value)
    ? (value as AssetSort)
    : "scans_desc";
}

function lastScannedMs(value: string | null): number {
  if (!value) return -Infinity; // nulls sort last under descending order
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Non-mutating sort of composed per-asset rows. Descending by the chosen metric;
 * rows without a last-scanned time sort last for `last_scanned_desc`.
 */
export function sortAssetRows<
  T extends { totalScans: number; submissionCount: number; lastScannedAt: string | null },
>(rows: T[], sort: AssetSort): T[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (sort) {
      case "submissions_desc":
        return b.submissionCount - a.submissionCount;
      case "last_scanned_desc":
        return lastScannedMs(b.lastScannedAt) - lastScannedMs(a.lastScannedAt);
      case "scans_desc":
      default:
        return b.totalScans - a.totalScans;
    }
  });
  return copy;
}

/** Per-asset scan totals (with latest scan time) and submission counts. */
export function perAssetActivity(
  scans: ScanRow[],
  submissions: SubmissionRow[]
): Map<string, AssetActivity> {
  const map = new Map<string, AssetActivity>();

  const get = (assetId: string): AssetActivity => {
    let entry = map.get(assetId);
    if (!entry) {
      entry = { totalScans: 0, lastScannedAt: null, submissionCount: 0 };
      map.set(assetId, entry);
    }
    return entry;
  };

  for (const s of scans) {
    const entry = get(s.asset_id);
    entry.totalScans += 1;
    if (
      entry.lastScannedAt === null ||
      new Date(s.scanned_at).getTime() > new Date(entry.lastScannedAt).getTime()
    ) {
      entry.lastScannedAt = s.scanned_at;
    }
  }

  for (const sub of submissions) {
    get(sub.asset_id).submissionCount += 1;
  }

  return map;
}
