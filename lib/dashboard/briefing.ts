/**
 * Pure helpers for the customer dashboard briefing (Prompt D). No I/O — the page fetches the
 * org's own RLS-scoped rows and passes them here. Everything is DERIVED from existing schema;
 * nothing is stored (no checklist table, no per-user read model).
 */

import { type ReadinessReason } from "@/lib/ui/status-view";
import { isUnresolvedStatus, submissionUrgency } from "@/lib/submissions/inbox";
import { returnChecklistFlags } from "@/lib/submissions/returns";

// ---------------------------------------------------------------------------
// Setup progress — "N of M assets ready", derived from readiness. Never stored.
// ---------------------------------------------------------------------------

export type SetupProgress = { ready: number; total: number; complete: boolean };

/**
 * Readiness roll-up over an org's NON-archived assets. `complete` is true only when there is at
 * least one asset and every one is ready — the section hides then, and reappears the moment a new
 * or edited asset drops below ready.
 */
export function setupProgress(assets: { ready: boolean }[]): SetupProgress {
  const total = assets.length;
  const ready = assets.reduce((n, a) => n + (a.ready ? 1 : 0), 0);
  return { ready, total, complete: total > 0 && ready === total };
}

// ---------------------------------------------------------------------------
// Needs-attention queue — the top things to act on, most severe first.
// ---------------------------------------------------------------------------

export type AttentionTone = "danger" | "warning";

export type AttentionItem = {
  key: string;
  assetId: string;
  code: string;
  title: string;
  reason: string;
  href: string;
  tone: AttentionTone;
  /** When the asset has an unresolved return checklist, its id — enables the quick action. */
  returnSubmissionId: string | null;
  /** Sort rank; lower = more urgent. */
  priority: number;
  /** Oldest/newest unresolved submission (epoch ms) — the age tie-breakers within a priority. */
  oldestUnresolvedMs: number | null;
  newestUnresolvedMs: number | null;
};

export type AttentionAsset = {
  id: string;
  code: string;
  name: string;
  rented: boolean;
  unresolvedCount: number;
  hasOpenDamage: boolean;
  hasUrgentDamage: boolean;
  hasUnresolvedReturn: boolean;
  returnSubmissionId: string | null;
  returnFlagsIssue: boolean;
  /** created_at (epoch ms) of the oldest / newest unresolved submission on this asset, or null. */
  oldestUnresolvedMs: number | null;
  newestUnresolvedMs: number | null;
};

const DAY_MS = 86_400_000;

/**
 * Build the needs-attention rows — ONE prioritized item per asset, most severe first. The
 * queue holds only actionable, time-sensitive operations; setup/readiness gaps are NOT here
 * (they live in the separate Setup section — see `buildSetupGaps`). Priority (lower first):
 *   1. damage on a rented asset (danger),
 *   2. unresolved damage on an available asset (danger),
 *   3. return checklist received while still rented (warning, quick action),
 *   4. rented asset with 2+ unresolved (warning),
 *   5. return checklist reporting damage/missing items (warning, quick action),
 *   6. unresolved older than ~24h (warning),
 *   7. any unresolved (warning, fallback).
 * `returnSubmissionId` rides along whenever the asset has an unresolved return, so the row can
 * offer "Mark returned & resolve". **Uncapped by default** — the queue is the primary work list
 * and must surface every qualifying asset; pass `cap` only to limit (e.g. in tests). Within a
 * priority, older unresolved work sorts first, then newer as the final tie-break.
 */
export function buildAttentionItems(
  assets: AttentionAsset[],
  opts: { cap?: number; now?: number } = {}
): AttentionItem[] {
  const cap = opts.cap ?? Number.POSITIVE_INFINITY;
  const now = opts.now ?? Date.now();
  const items: AttentionItem[] = [];

  for (const a of assets) {
    // The quick action only rides on return-oriented rows, so a damage/stale row never
    // offers "Mark returned & resolve" (which would resolve the return, not the damage).
    const base = {
      assetId: a.id,
      code: a.code,
      href: `/dashboard/submissions?asset_id=${a.id}&status=unresolved`,
      returnSubmissionId: null as string | null,
      oldestUnresolvedMs: a.oldestUnresolvedMs,
      newestUnresolvedMs: a.newestUnresolvedMs,
    };
    const plural = a.unresolvedCount === 1 ? "" : "s";
    let item: AttentionItem | null = null;

    if (a.rented && a.hasOpenDamage) {
      item = {
        ...base,
        key: `${a.id}:damage-rented`,
        title: "Open damage on a rented asset",
        reason: a.hasUrgentDamage
          ? "Marked urgent. Review before the next handoff."
          : "Review before the next handoff.",
        tone: "danger",
        priority: 1,
      };
    } else if (!a.rented && a.hasOpenDamage) {
      item = {
        ...base,
        key: `${a.id}:damage-available`,
        title: "Unresolved damage on an available asset",
        reason: "Resolve it before the asset goes out again.",
        tone: "danger",
        priority: 2,
      };
    } else if (a.rented && a.hasUnresolvedReturn) {
      item = {
        ...base,
        key: `${a.id}:return-rented`,
        title: "Return checklist received while still rented",
        reason: "Mark it returned to free the asset.",
        tone: "warning",
        priority: 3,
        returnSubmissionId: a.returnSubmissionId,
      };
    } else if (a.rented && a.unresolvedCount >= 2) {
      item = {
        ...base,
        key: `${a.id}:multi-rented`,
        title: `${a.unresolvedCount} open submissions on a rented asset`,
        reason: a.name,
        tone: "warning",
        priority: 4,
      };
    } else if (a.hasUnresolvedReturn && a.returnFlagsIssue) {
      item = {
        ...base,
        key: `${a.id}:return-flagged`,
        title: "Return reports damage or missing items",
        reason: a.name,
        tone: "warning",
        priority: 5,
        returnSubmissionId: a.returnSubmissionId,
      };
    } else if (
      a.oldestUnresolvedMs !== null &&
      now - a.oldestUnresolvedMs > DAY_MS
    ) {
      const hours = Math.floor((now - a.oldestUnresolvedMs) / (60 * 60 * 1000));
      item = {
        ...base,
        key: `${a.id}:stale`,
        title: `${a.unresolvedCount} open submission${plural}`,
        reason: `Waiting ${hours}h without a response.`,
        tone: "warning",
        priority: 6,
      };
    } else if (a.unresolvedCount > 0) {
      item = {
        ...base,
        key: `${a.id}:unresolved`,
        title: `${a.unresolvedCount} open submission${plural}`,
        reason: a.name,
        tone: "warning",
        priority: 7,
      };
    }

    if (item) items.push(item);
  }

  // Severity first, then oldest unresolved work (age) first, then newest as the final tie-break.
  const olderFirst = (a: number | null, b: number | null) =>
    (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
  const newerFirst = (a: number | null, b: number | null) =>
    (b ?? Number.NEGATIVE_INFINITY) - (a ?? Number.NEGATIVE_INFINITY);
  items.sort(
    (x, y) =>
      x.priority - y.priority ||
      olderFirst(x.oldestUnresolvedMs, y.oldestUnresolvedMs) ||
      newerFirst(x.newestUnresolvedMs, y.newestUnresolvedMs)
  );
  return cap === Number.POSITIVE_INFINITY ? items : items.slice(0, cap);
}

// ---------------------------------------------------------------------------
// Per-asset unresolved roll-up — derives the attention signals from the org's
// already-fetched unresolved submission rows. Pure; nothing stored.
// ---------------------------------------------------------------------------

export type UnresolvedSignals = {
  unresolvedCount: number;
  hasOpenDamage: boolean;
  hasUrgentDamage: boolean;
  hasUnresolvedReturn: boolean;
  returnSubmissionId: string | null;
  returnFlagsIssue: boolean;
  oldestUnresolvedMs: number | null;
  newestUnresolvedMs: number | null;
};

export type AttentionSubmission = {
  id: string;
  asset_id: string | null;
  form_type: string;
  status: string;
  created_at: string;
  submission_data_json?: unknown;
};

/**
 * Fold an org's submissions into per-asset attention signals, counting only unresolved
 * (new/reviewed) rows. Damage → open/urgent flags; return checklist → the first unresolved
 * return submission id in input order + a damage/missing flag; the oldest unresolved timestamp
 * drives the "stale" item. Keyed by `asset_id`; submissions with no asset are ignored.
 */
export function summarizeUnresolvedByAsset(
  submissions: AttentionSubmission[]
): Map<string, UnresolvedSignals> {
  const map = new Map<string, UnresolvedSignals>();
  for (const s of submissions) {
    if (!s.asset_id || !isUnresolvedStatus(s.status)) continue;
    const cur =
      map.get(s.asset_id) ??
      {
        unresolvedCount: 0,
        hasOpenDamage: false,
        hasUrgentDamage: false,
        hasUnresolvedReturn: false,
        returnSubmissionId: null,
        returnFlagsIssue: false,
        oldestUnresolvedMs: null,
        newestUnresolvedMs: null,
      };

    cur.unresolvedCount += 1;

    if (s.form_type === "damage_report") {
      cur.hasOpenDamage = true;
      if (submissionUrgency(s.form_type, s.submission_data_json) === "high") {
        cur.hasUrgentDamage = true;
      }
    }

    if (s.form_type === "return_checklist") {
      cur.hasUnresolvedReturn = true;
      if (cur.returnSubmissionId === null) cur.returnSubmissionId = s.id;
      if (returnChecklistFlags(s.submission_data_json).flagged) {
        cur.returnFlagsIssue = true;
      }
    }

    const t = new Date(s.created_at).getTime();
    if (!Number.isNaN(t)) {
      cur.oldestUnresolvedMs =
        cur.oldestUnresolvedMs === null ? t : Math.min(cur.oldestUnresolvedMs, t);
      cur.newestUnresolvedMs =
        cur.newestUnresolvedMs === null ? t : Math.max(cur.newestUnresolvedMs, t);
    }

    map.set(s.asset_id, cur);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Setup gaps — the re-sourced, low-priority readiness list (NOT the attention
// queue). Moved off the action queue so setup never competes with active work.
// ---------------------------------------------------------------------------

export type SetupGap = {
  id: string;
  code: string;
  name: string;
  title: string;
  href: string;
};

/** Fix link for a setup-gap reason → the page that resolves it. */
function reasonHref(assetId: string, reason: ReadinessReason): string {
  switch (reason) {
    case "page_missing":
    case "page_draft":
      return `/dashboard/assets/${assetId}/page`;
    default:
      // missing_qr / qr_inactive / asset_private / org_inactive → asset detail.
      return `/dashboard/assets/${assetId}`;
  }
}

const SETUP_TITLE: Partial<Record<ReadinessReason, string>> = {
  missing_qr: "Needs a QR tag",
  qr_inactive: "QR link is inactive",
  page_missing: "No equipment page yet",
  page_draft: "Equipment page is a draft",
  asset_private: "Asset is private",
};

/**
 * The setup/readiness gaps for the quiet Setup section — never time-sensitive ops, so they
 * never enter the attention queue. Up to `limit` (default 3) not-ready assets, each linking to
 * the page that fixes it.
 */
export function buildSetupGaps(
  assets: {
    id: string;
    code: string;
    name: string;
    ready: boolean;
    reason: ReadinessReason | null;
  }[],
  limit = 3
): SetupGap[] {
  const gaps: SetupGap[] = [];
  for (const a of assets) {
    if (a.ready || !a.reason) continue;
    gaps.push({
      id: a.id,
      code: a.code,
      name: a.name,
      title: SETUP_TITLE[a.reason] ?? "Not live yet",
      href: reasonHref(a.id, a.reason),
    });
    if (gaps.length >= limit) break;
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Recent activity — a quiet chronological feed merged from a few sources.
// ---------------------------------------------------------------------------

export type ActivityKind =
  | "scan"
  | "submission"
  | "return"
  | "rental"
  | "tag_request";

export type ActivityEvent = {
  kind: ActivityKind;
  /** ISO timestamp used only for ordering + relative display. */
  at: string;
  label: string;
  code?: string | null;
  assetId?: string | null;
  href?: string | null;
};

/** Merge activity events newest-first and cap to `limit`. Invalid dates sort last. */
export function mergeRecentActivity(
  events: ActivityEvent[],
  limit = 10
): ActivityEvent[] {
  const ms = (v: string) => {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...events].sort((a, b) => ms(b.at) - ms(a.at)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Nameplate band — greeting, ranked BandStats, and dashboard invariants
// (docs/brand/dashboard-reference.html + ui-language.md). All derived, never stored.
// ---------------------------------------------------------------------------

/** Time-of-day greeting for the nameplate headline. */
export function timeGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export type BandStatSpec = {
  key: string;
  label: string;
  value: number;
  total?: number;
  href: string;
  /** Attention numbers render amber; only when the count is non-zero. */
  attention?: boolean;
  /** The scans stat carries the 7-day sparkline. */
  sparkline?: boolean;
};

/**
 * The operational-pulse BandStats: rented, unresolved, scans·7d, assets ready — exactly the four
 * live numbers that describe the operating day. Every stat links to an existing filtered view — a
 * stat that links nowhere does not belong in the band (ui-language.md), which the test suite
 * enforces. `attention` is on only when unresolved > 0, so the all-clear state stays neutral.
 * **Assets ready** uses the same `setupProgress` value the Setup section uses (one readiness
 * source). Covered-asset usage is a commercial number, not an operations one, so it lives on the
 * Assets page / owner surfaces / the dashboard footer — never as a permanent band stat here.
 * No ROI, no IP/user-agent.
 */
export function buildBandStats(input: {
  rented: number;
  unresolved: number;
  scans7d: number;
  ready: number;
  totalAssets: number;
}): BandStatSpec[] {
  return [
    {
      key: "rented",
      label: "rented",
      value: input.rented,
      total: input.totalAssets,
      href: "/dashboard/assets?rental=rented",
    },
    {
      key: "unresolved",
      label: "unresolved",
      value: input.unresolved,
      href: "/dashboard/submissions",
      attention: input.unresolved > 0,
    },
    {
      key: "scans",
      label: "scans · 7d",
      value: input.scans7d,
      href: "/dashboard/analytics",
      sparkline: true,
    },
    {
      key: "ready",
      label: "assets ready",
      value: input.ready,
      total: input.totalAssets,
      href: "/dashboard/assets",
    },
  ];
}

/**
 * Dashboard section order below the briefing band. Captured-so-far (proof of value) comes right
 * after the attention queue; Setup progress is the lowest-priority section. Exported so the page
 * render order is anchored by a test rather than only living in JSX.
 */
export const DASHBOARD_SECTION_ORDER = [
  "attention",
  "captured",
  "activity",
  "setup",
] as const;

/**
 * Optional commercial coverage warning — shown OUTSIDE the four operational band stats, only when a
 * plan cap exists and usage is high (≥80% → "warn", ≥100% → "over"). Returns null when there is no
 * `limit` (unlimited/custom plans) or usage is comfortably under the cap, so the dashboard stays an
 * operations surface by default. Percentage is rounded for display.
 */
export function coverageStatus(
  covered: number,
  limit: number | null
): { pct: number; level: "warn" | "over" } | null {
  if (limit === null || limit <= 0) return null;
  const ratio = covered / limit;
  if (ratio < 0.8) return null;
  return { pct: Math.round(ratio * 100), level: ratio >= 1 ? "over" : "warn" };
}

/**
 * Setup detail visibility: shown only when there is at least one asset and not
 * every asset is ready. Hidden at 100% (and at zero assets); reappears the moment
 * readiness drops. The ready/total BandStat stays visible regardless.
 */
export function shouldShowSetupDetail(progress: SetupProgress): boolean {
  return progress.total > 0 && !progress.complete;
}

/**
 * Daily scan counts over the last `days`, oldest-first with the current day last
 * (the sparkline's brass bar). Buckets by UTC day — a viz approximation, not a
 * reporting figure. Invalid/missing timestamps are ignored.
 */
export function scanTrend(
  events: { scanned_at: string | null }[],
  days = 7,
  now = Date.now()
): number[] {
  const buckets = new Array<number>(days).fill(0);
  const dayMs = 86_400_000;
  const todayStart = now - (now % dayMs);
  for (const e of events) {
    if (!e.scanned_at) continue;
    const t = new Date(e.scanned_at).getTime();
    if (Number.isNaN(t)) continue;
    const eventDayStart = t - (t % dayMs);
    const daysAgo = Math.round((todayStart - eventDayStart) / dayMs);
    if (daysAgo >= 0 && daysAgo < days) {
      buckets[days - 1 - daysAgo] += 1;
    }
  }
  return buckets;
}

/**
 * Single-open accordion transition: clicking the open item closes it, clicking a
 * closed item opens it (and, by returning a single id, collapses any other). The
 * dashboard queue pre-expands the top item when the attention count > 0.
 */
export function nextOpenAccordionId(
  current: string | null,
  clicked: string
): string | null {
  return current === clicked ? null : clicked;
}

export type ScanRollup = { assetId: string; count: number; at: string };

/**
 * Roll raw scan events up to one row per asset per (UTC) day so the activity feed
 * shows "Scanned N times" instead of scan spam. Each rollup keeps the most-recent
 * scan time for ordering + relative display. Invalid/missing timestamps are dropped.
 * Newest-first.
 */
export function rollupScanEvents(
  scans: { asset_id: string | null; scanned_at: string | null }[]
): ScanRollup[] {
  const dayMs = 86_400_000;
  const groups = new Map<string, ScanRollup>();
  for (const s of scans) {
    if (!s.asset_id || !s.scanned_at) continue;
    const t = new Date(s.scanned_at).getTime();
    if (Number.isNaN(t)) continue;
    const dayStart = t - (t % dayMs);
    const key = `${s.asset_id}:${dayStart}`;
    const prev = groups.get(key);
    if (prev) {
      prev.count += 1;
      if (t > new Date(prev.at).getTime()) prev.at = s.scanned_at;
    } else {
      groups.set(key, { assetId: s.asset_id, count: 1, at: s.scanned_at });
    }
  }
  return [...groups.values()].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
}
