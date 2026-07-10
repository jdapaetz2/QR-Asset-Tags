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
  summarizeActivity,
  perAssetActivity,
  dailyCounts,
  normalizeAssetSort,
  sortAssetRows,
  type AssetSort,
  type ScanRow,
  type SubmissionRow,
} from "@/lib/analytics/activity";
import {
  scansByCategory,
  submissionsHref,
  UNRESOLVED_STATUSES,
  type AssetInfo,
} from "@/lib/analytics/insights";
import {
  parseRange,
  rangeCutoffMs,
  rangePeriodWord,
  rangeLabel,
  rangeStamp,
  withinRange,
} from "@/lib/analytics/range";
import { buildProblemAssets } from "@/lib/analytics/problem-assets";

// Activity counts are live per request; never cache.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type AssetRow = {
  id: string;
  asset_code: string;
  asset_name: string;
  public_status: string;
  category: string | null;
};

function firstString(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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

  // All reads are RLS-scoped to the caller's organization.
  const { data: orgData } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  const { data: assetData } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name, public_status, category")
    .order("asset_code", { ascending: true });
  const assets = (assetData ?? []) as AssetRow[];

  const { data: qrData } = await supabase
    .from("qr_links")
    .select("asset_id, status");
  const qrByAsset = new Map<string, boolean>(); // asset_id → has active
  const qrExists = new Set<string>();
  for (const q of (qrData ?? []) as { asset_id: string; status: string }[]) {
    qrExists.add(q.asset_id);
    if (q.status === "active") qrByAsset.set(q.asset_id, true);
  }

  const { data: pageData } = await supabase
    .from("equipment_pages")
    .select("asset_id, is_published");
  const pageByAsset = new Map<string, boolean>();
  for (const p of (pageData ?? []) as { asset_id: string; is_published: boolean }[]) {
    pageByAsset.set(p.asset_id, p.is_published);
  }

  // Privacy: only asset_id + scanned_at — never ip_hash / user_agent / referrer.
  const { data: scanData } = await supabase
    .from("scan_events")
    .select("asset_id, scanned_at");
  const scans = (scanData ?? []) as ScanRow[];

  // Privacy: counts + timestamps only — no submission contents, no IP/user-agent.
  const { data: subData } = await supabase
    .from("form_submissions")
    .select("asset_id, form_type, status, created_at");
  const submissions = (subData ?? []) as (SubmissionRow & { created_at: string })[];

  const now = new Date();
  const cutoff = rangeCutoffMs(now.getTime(), range);

  // Range-scoped rows (everything except last-scanned responds to the RangeControl).
  const rangeScans = withinRange(scans, (s) => s.scanned_at, cutoff);
  const rangeSubs = withinRange(submissions, (s) => s.created_at, cutoff);

  // Daily charts. Totals come from the series so the headers/headline always agree.
  const scanSeries = dailyCounts(scans.map((s) => s.scanned_at), range, now);
  const newSubSeries = dailyCounts(
    submissions.filter((s) => s.status === "new").map((s) => s.created_at),
    range,
    now
  );
  const scansTotal = scanSeries.reduce((n, d) => n + d.count, 0);
  const newTotal = newSubSeries.reduce((n, d) => n + d.count, 0);

  // Range-scoped composition + per-asset counts.
  const summary = summarizeActivity(rangeScans, rangeSubs, now);
  const perAssetRange = perAssetActivity(rangeScans, rangeSubs);

  const assetInfo: AssetInfo[] = assets.map((a) => ({
    id: a.id,
    asset_code: a.asset_code,
    asset_name: a.asset_name,
    category: a.category,
  }));
  const nameById = new Map(assets.map((a) => [a.id, a.asset_name]));

  // Last-scanned is all-time (the genuine most-recent scan), not range-scoped.
  const lastScanByAsset = new Map<string, string>();
  for (const s of scans) {
    const prev = lastScanByAsset.get(s.asset_id);
    if (!prev || new Date(s.scanned_at).getTime() > new Date(prev).getTime()) {
      lastScanByAsset.set(s.asset_id, s.scanned_at);
    }
  }

  // Open (unresolved) submissions per asset, within range.
  const openByAsset = new Map<string, number>();
  for (const sub of rangeSubs) {
    if ((UNRESOLVED_STATUSES as readonly string[]).includes(sub.status)) {
      openByAsset.set(sub.asset_id, (openByAsset.get(sub.asset_id) ?? 0) + 1);
    }
  }

  const scanCountByAsset = new Map<string, number>();
  for (const [id, act] of perAssetRange) scanCountByAsset.set(id, act.totalScans);

  const problems = buildProblemAssets(assetInfo, rangeSubs, scanCountByAsset, 6);
  const catRows = scansByCategory(assetInfo, rangeScans);

  // Top asset by scans in range → the band subline.
  let topAssetName: string | null = null;
  let topScans = 0;
  for (const [id, act] of perAssetRange) {
    if (act.totalScans > topScans) {
      topScans = act.totalScans;
      topAssetName = nameById.get(id) ?? null;
    }
  }

  // Per-asset table rows (scans/submissions range-scoped; last-scanned all-time).
  const assetRows = assets.map((a) => {
    const qrStatus = qrByAsset.get(a.id)
      ? ("active" as const)
      : qrExists.has(a.id)
        ? ("disabled" as const)
        : null;
    const pageStatus = assetPageStatus(
      pageByAsset.has(a.id),
      pageByAsset.get(a.id) ?? false
    );
    const readiness = deriveAssetStatus({
      rented: false,
      publicStatus: a.public_status,
      qrStatus,
      pageStatus,
    }).readiness;
    const act = perAssetRange.get(a.id);
    return {
      id: a.id,
      asset_code: a.asset_code,
      readiness,
      totalScans: act?.totalScans ?? 0,
      submissionCount: act?.submissionCount ?? 0,
      lastScannedAt: lastScanByAsset.get(a.id) ?? null,
      open: openByAsset.get(a.id) ?? 0,
    };
  });
  const sortedRows = sortAssetRows(assetRows, sort);

  const label = rangeLabel(range);
  const headline = `${plural(scansTotal, "scan")} and ${plural(newTotal, "new submission")} ${rangePeriodWord(range)}.`;

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsBand
        orgName={orgData?.name ?? "Your organization"}
        stamp={rangeStamp(now, range)}
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
          <SubmissionsCard byStatus={summary.byStatus} byType={summary.byType} />
        </div>
      </div>

      {/* Problem assets — one consolidated ranked module (open count, then submissions). */}
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
