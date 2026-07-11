import Link from "next/link";

import { requireOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { RelativeTime } from "@/components/relative-time";
import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { DailyBars } from "@/components/ui/daily-bars";
import { AnalyticsBand } from "@/components/analytics/analytics-band";
import { RangeControl } from "@/components/analytics/range-control";
import { RefreshButton } from "@/components/analytics/refresh-button";
import { CategoryBarList } from "@/components/analytics/category-bar-list";
import { SubmissionsCard } from "@/components/analytics/submissions-card";
import { ProblemAssets } from "@/components/analytics/problem-assets";
import { assetPageStatus } from "@/lib/assets/list";
import { deriveAssetStatus, readinessReasonLabel } from "@/lib/ui/status-view";
import {
  normalizeAssetSort,
  sortAssetRows,
  type AssetSort,
} from "@/lib/analytics/activity";
import { submissionsHref } from "@/lib/analytics/insights";
import { parseRange, rangePeriodWord, rangeLabel } from "@/lib/analytics/range";
import { rankProblemAssets } from "@/lib/analytics/problem-assets";
import {
  buildBreakdown,
  toDailySeries,
  type AssetActivityRow,
  type BreakdownRow,
  type CategoryRow,
  type DailyActivityRow,
} from "@/lib/analytics/rpc";

// Activity counts are live per request; never cache.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function firstString(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "2026-07-04" → "JUL 4" (no Date parsing → no timezone shift). */
function monthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d ?? ""}`;
}

/** Band stamp built from the RPC's yard-local days, e.g. "JUL 4 – JUL 10 · 2026". */
function rangeStampFromDays(days: DailyActivityRow[]): string {
  if (days.length === 0) return "";
  const first = days[0].day;
  const last = days[days.length - 1].day;
  return `${monthDay(first)} – ${monthDay(last)} · ${last.slice(0, 4)}`;
}

function SortHeader({
  label,
  sortKey,
  current,
  range,
  align = "left",
}: {
  label: string;
  sortKey: AssetSort;
  current: AssetSort;
  range: number;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  return (
    <th
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.07em] text-iron-600 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <Link
        href={`/dashboard/analytics?range=${range}&sort=${sortKey}`}
        className={`inline-flex items-center gap-1 underline-offset-4 hover:underline ${active ? "text-foreground" : ""}`}
        aria-current={active ? "true" : undefined}
      >
        {label}
        {active ? <span aria-hidden>▾</span> : null}
      </Link>
    </th>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const orgId = await requireOrgId();
  const sp = await searchParams;
  const range = parseRange(firstString(sp.range));
  const sort = normalizeAssetSort(firstString(sp.sort));

  const supabase = await createClient();

  // Small metadata reads (bounded by asset count, for app-derived readiness + org name)
  // plus four compact yard-local aggregation RPCs. No raw scan_events / form_submissions
  // rows are pulled for analytics — the DB does the grouping, RLS-scoped, invoker rights.
  const [
    { data: orgData },
    { data: assetMeta },
    { data: qrData },
    { data: pageData },
    { data: dailyData },
    { data: catData },
    { data: breakdownData },
    { data: assetActData },
  ] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.from("assets").select("id, public_status"),
    supabase.from("qr_links").select("asset_id, status"),
    supabase.from("equipment_pages").select("asset_id, is_published"),
    supabase.rpc("analytics_daily_activity", { p_days: range }),
    supabase.rpc("analytics_scans_by_category", { p_days: range }),
    supabase.rpc("analytics_submission_breakdown", { p_days: range }),
    supabase.rpc("analytics_asset_activity", { p_days: range }),
  ]);

  const publicStatusById = new Map<string, string>();
  for (const a of (assetMeta ?? []) as { id: string; public_status: string }[]) {
    publicStatusById.set(a.id, a.public_status);
  }
  const qrByAsset = new Map<string, boolean>(); // asset_id → has active
  const qrExists = new Set<string>();
  for (const q of (qrData ?? []) as { asset_id: string; status: string }[]) {
    qrExists.add(q.asset_id);
    if (q.status === "active") qrByAsset.set(q.asset_id, true);
  }
  const pageByAsset = new Map<string, boolean>();
  for (const p of (pageData ?? []) as { asset_id: string; is_published: boolean }[]) {
    pageByAsset.set(p.asset_id, p.is_published);
  }

  const daily = (dailyData ?? []) as DailyActivityRow[];
  const catRows = ((catData ?? []) as CategoryRow[]).map((c) => ({
    category: c.category,
    count: Number(c.scan_count),
  }));
  const breakdown = buildBreakdown((breakdownData ?? []) as BreakdownRow[]);
  const assetAct = (assetActData ?? []) as AssetActivityRow[];

  const now = new Date();

  // Charts + headline totals derive from the SAME DB daily buckets, so they always agree.
  const { scans: scanSeries, newSubmissions: newSubSeries } = toDailySeries(daily);
  const scansTotal = scanSeries.reduce((n, d) => n + d.count, 0);
  const newTotal = newSubSeries.reduce((n, d) => n + d.count, 0);

  const problems = rankProblemAssets(assetAct, 6);

  // Top asset by scans in range → the band subline.
  let topAssetName: string | null = null;
  let topScans = 0;
  for (const r of assetAct) {
    const c = Number(r.scan_count);
    if (c > topScans) {
      topScans = c;
      topAssetName = r.asset_name;
    }
  }

  // Per-asset table — the RPC returns one row per non-archived asset (scan/submission
  // counts range-scoped, last_scanned_at + open all-time). Readiness stays app-derived.
  const assetRows = assetAct.map((r) => {
    const qrStatus = qrByAsset.get(r.asset_id)
      ? ("active" as const)
      : qrExists.has(r.asset_id)
        ? ("disabled" as const)
        : null;
    const pageStatus = assetPageStatus(
      pageByAsset.has(r.asset_id),
      pageByAsset.get(r.asset_id) ?? false
    );
    const readiness = deriveAssetStatus({
      rented: false,
      publicStatus: publicStatusById.get(r.asset_id) ?? "private",
      qrStatus,
      pageStatus,
    }).readiness;
    return {
      id: r.asset_id,
      asset_code: r.asset_code,
      readiness,
      totalScans: Number(r.scan_count),
      submissionCount: Number(r.submission_count),
      lastScannedAt: r.last_scanned_at,
      open: Number(r.open_submission_count),
    };
  });
  const sortedRows = sortAssetRows(assetRows, sort);

  const label = rangeLabel(range);
  const headline = `${plural(scansTotal, "scan")} and ${plural(newTotal, "new submission")} ${rangePeriodWord(range)}.`;

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsBand
        orgName={orgData?.name ?? "Your organization"}
        stamp={rangeStampFromDays(daily)}
        headline={headline}
        topAssetName={topScans > 0 ? topAssetName : null}
        updatedAt={now.toISOString()}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeControl range={range} sort={sort} />
        <RefreshButton />
      </div>

      {/* Trend charts — one brass current-period bar each; totals in the header. */}
      <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-iron-200 bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <Eyebrow>Scans per day</Eyebrow>
            <span className="font-mono text-[13px] tabular-nums">{scansTotal}</span>
          </div>
          <DailyBars
            data={scanSeries}
            summary={`${scansTotal} scans over the last ${range} days`}
          />
        </div>
        <div className="rounded-lg border border-iron-200 bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <Eyebrow>New submissions per day</Eyebrow>
            <span className="font-mono text-[13px] tabular-nums">{newTotal}</span>
          </div>
          <DailyBars
            data={newSubSeries}
            summary={`${newTotal} new submissions over the last ${range} days`}
          />
        </div>
      </div>

      {/* Composition */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <div className="rounded-lg border border-iron-200 bg-card p-4">
          <Eyebrow className="mb-3">Scans by category · {label}</Eyebrow>
          <CategoryBarList rows={catRows} emptyLabel="No scans in this range yet." />
        </div>
        <div className="rounded-lg border border-iron-200 bg-card p-4">
          <Eyebrow className="mb-3">Submissions · {label}</Eyebrow>
          <SubmissionsCard byStatus={breakdown.byStatus} byType={breakdown.byType} />
        </div>
      </div>

      {/* Problem assets — one consolidated ranked module (open backlog, then submissions). */}
      {problems.length > 0 ? (
        <section>
          <Eyebrow as="h2" className="mb-2.5">
            Problem assets · {label}
          </Eyebrow>
          <ProblemAssets rows={problems} />
        </section>
      ) : null}

      {/* Per-asset activity */}
      <section>
        <Eyebrow as="h2" className="mb-2.5">
          Per-asset activity · sorted by {sort === "submissions_desc" ? "submissions" : sort === "last_scanned_desc" ? "last scanned" : "scans"}
        </Eyebrow>
        {sortedRows.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Once your assets have QR tags and renters start scanning, per-asset scan and submission counts will appear here."
            action={
              <Link
                href="/dashboard/assets"
                className="text-sm underline-offset-4 hover:underline"
              >
                Go to assets →
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-iron-200 bg-card">
            <table className="w-full text-[13px]">
              <thead className="border-b border-iron-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.07em] text-iron-600">
                    Asset
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.07em] text-iron-600">
                    Readiness
                  </th>
                  <SortHeader label="Scans" sortKey="scans_desc" current={sort} range={range} align="right" />
                  <SortHeader label="Last scanned" sortKey="last_scanned_desc" current={sort} range={range} />
                  <SortHeader label="Submissions" sortKey="submissions_desc" current={sort} range={range} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[#EFEDE7] last:border-b-0 ${row.open > 0 ? "bg-[#FDF9F0]" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <AssetTagChip code={row.asset_code} />
                    </td>
                    <td className="px-3 py-2.5">
                      {row.readiness.ready ? (
                        <span
                          className="inline-block size-2 rounded-full bg-success"
                          title="Ready"
                          aria-label="Ready"
                        />
                      ) : (
                        <span className="rounded-md bg-amber-chip-bg px-2 py-0.5 text-xs text-amber-chip-text">
                          {row.readiness.reason ? readinessReasonLabel(row.readiness.reason) : "Not ready"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {row.totalScans}
                    </td>
                    <td className="px-3 py-2.5 text-iron-600">
                      <RelativeTime value={row.lastScannedAt} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {row.open > 0 ? (
                        <Link
                          href={submissionsHref({ assetId: row.id, status: "unresolved" })}
                          className="rounded-md bg-amber-chip-bg px-2 py-0.5 text-xs text-amber-chip-text"
                        >
                          {row.submissionCount} · {row.open} open
                        </Link>
                      ) : (
                        <Link
                          href={submissionsHref({ assetId: row.id })}
                          className="font-mono tabular-nums text-iron-600 underline-offset-4 hover:underline"
                        >
                          {row.submissionCount}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
