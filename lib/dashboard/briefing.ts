/**
 * Pure helpers for the customer dashboard briefing (Prompt D). No I/O — the page fetches the
 * org's own RLS-scoped rows and passes them here. Everything is DERIVED from existing schema;
 * nothing is stored (no checklist table, no per-user read model).
 */

import {
  type AssetStatusView,
  type ReadinessReason,
  readinessReasonLabel,
} from "@/lib/ui/status-view";

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
};

export type AttentionAsset = {
  id: string;
  code: string;
  name: string;
  rented: boolean;
  readiness: AssetStatusView["readiness"];
  unresolvedCount: number;
  hasOpenDamage: boolean;
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
 * Build the needs-attention rows for the briefing. Order of severity:
 *   1. rented asset with an open damage report (danger),
 *   2. assets with unresolved submissions (warning, by count desc),
 *   3. setup gaps — not live/scannable (warning).
 * An asset can appear for more than one concern. Capped to `cap` (default 10).
 */
export function buildAttentionItems(
  assets: AttentionAsset[],
  opts: { cap?: number } = {}
): AttentionItem[] {
  const cap = opts.cap ?? 10;
  const damage: AttentionItem[] = [];
  const unresolved: AttentionItem[] = [];
  const setup: AttentionItem[] = [];

  for (const a of assets) {
    if (a.rented && a.hasOpenDamage) {
      damage.push({
        key: `${a.id}:damage`,
        assetId: a.id,
        code: a.code,
        title: "Open damage on a rented asset",
        reason: "Review before the next handoff.",
        href: `/dashboard/submissions?asset_id=${a.id}&status=unresolved`,
        tone: "danger",
      });
    } else if (a.unresolvedCount > 0) {
      unresolved.push({
        key: `${a.id}:unresolved`,
        assetId: a.id,
        code: a.code,
        title: `${a.unresolvedCount} open submission${a.unresolvedCount === 1 ? "" : "s"}`,
        reason: a.name,
        href: `/dashboard/submissions?asset_id=${a.id}&status=unresolved`,
        tone: "warning",
      });
    }

    if (!a.readiness.ready && a.readiness.reason) {
      const reason = a.readiness.reason;
      setup.push({
        key: `${a.id}:setup`,
        assetId: a.id,
        code: a.code,
        title: SETUP_TITLE[reason] ?? "Not live yet",
        reason: `${a.name} · ${readinessReasonLabel(reason)}`,
        href: reasonHref(a.id, reason),
        tone: "warning",
      });
    }
  }

  unresolved.sort(
    (x, y) =>
      (assetById(assets, y.assetId)?.unresolvedCount ?? 0) -
      (assetById(assets, x.assetId)?.unresolvedCount ?? 0)
  );

  return [...damage, ...unresolved, ...setup].slice(0, cap);
}

function assetById(assets: AttentionAsset[], id: string): AttentionAsset | undefined {
  return assets.find((a) => a.id === id);
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
 * The four ranked BandStats. Every stat links to an existing filtered view — a
 * stat that links nowhere does not belong in the band (ui-language.md), which the
 * test suite enforces. `attention` is on only when the new-submissions count > 0,
 * so the all-clear state stays neutral.
 */
export function buildBandStats(input: {
  newCount: number;
  scans7d: number;
  rented: number;
  ready: number;
  totalAssets: number;
}): BandStatSpec[] {
  return [
    {
      key: "new",
      label: "new submissions",
      value: input.newCount,
      href: "/dashboard/submissions?status=new",
      attention: input.newCount > 0,
    },
    {
      key: "scans",
      label: "scans · 7d",
      value: input.scans7d,
      href: "/dashboard/analytics",
      sparkline: true,
    },
    {
      key: "rented",
      label: "rented",
      value: input.rented,
      total: input.totalAssets,
      href: "/dashboard/assets?rental=rented",
    },
    {
      key: "ready",
      label: "assets ready",
      value: input.ready,
      total: input.totalAssets,
      href: "/dashboard/assets?page=published",
    },
  ];
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
