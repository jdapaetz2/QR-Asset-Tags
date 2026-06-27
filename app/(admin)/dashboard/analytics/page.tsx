import Link from "next/link";

import { requireOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { BarChart } from "@/components/ui/bar-chart";
import { StatBar } from "@/components/ui/stat-bar";
import { assetReadiness } from "@/lib/qr/production";
import {
  SUBMISSION_STATUSES,
  FORM_TYPE_LABELS,
} from "@/lib/submissions/display";
import {
  summarizeActivity,
  perAssetActivity,
  dailyCounts,
  normalizeAssetSort,
  sortAssetRows,
  ANALYTICS_FORM_TYPES,
  type AssetSort,
  type ScanRow,
  type SubmissionRow,
} from "@/lib/analytics/activity";

// Activity counts are live per request; never cache.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type AssetRow = {
  id: string;
  asset_code: string;
  asset_name: string;
  public_status: string;
};

function firstString(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toISOString().slice(0, 16).replace("T", " ");
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SortHeader({
  label,
  sortKey,
  current,
}: {
  label: string;
  sortKey: AssetSort;
  current: AssetSort;
}) {
  const active = current === sortKey;
  return (
    <th className="px-4 py-2 font-medium">
      <Link
        href={`/dashboard/analytics?sort=${sortKey}`}
        className={`inline-flex items-center gap-1 underline-offset-4 hover:underline ${
          active ? "font-semibold text-foreground" : ""
        }`}
        aria-current={active ? "true" : undefined}
      >
        {label}
        {active ? <span aria-hidden>▼</span> : null}
      </Link>
    </th>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Login + org required (platform owners are redirected to their own landing).
  await requireOrgId();
  const sp = await searchParams;
  const sort = normalizeAssetSort(firstString(sp.sort));

  const supabase = await createClient();

  // All reads are RLS-scoped to the caller's organization.
  const { data: assetData } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name, public_status")
    .order("asset_code", { ascending: true });
  const assets = (assetData ?? []) as AssetRow[];

  const { data: qrData } = await supabase
    .from("qr_links")
    .select("asset_id, short_code, status");
  const qrByAsset = new Map<string, { short_code: string; status: string }>();
  for (const q of (qrData ?? []) as {
    asset_id: string;
    short_code: string;
    status: string;
  }[]) {
    if (!qrByAsset.has(q.asset_id)) qrByAsset.set(q.asset_id, q);
  }
  const activeQrLinks = (qrData ?? []).filter(
    (q) => (q as { status: string }).status === "active"
  ).length;

  const { data: pageData } = await supabase
    .from("equipment_pages")
    .select("asset_id, is_published");
  const pageByAsset = new Map<string, boolean>();
  for (const p of (pageData ?? []) as {
    asset_id: string;
    is_published: boolean;
  }[]) {
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
  const submissions = (subData ?? []) as (SubmissionRow & {
    created_at: string;
  })[];

  const summary = summarizeActivity(scans, submissions);
  const perAsset = perAssetActivity(scans, submissions);

  // 30-day trends (bucketed by UTC day; no new queries — derived from rows above).
  const scanSeries = dailyCounts(scans.map((s) => s.scanned_at), 30);
  const submissionSeries = dailyCounts(
    submissions.map((s) => s.created_at),
    30
  );

  // Compose per-asset rows, then apply the requested sort (default: most scans).
  const assetRows = assets.map((asset) => {
    const qr = qrByAsset.get(asset.id) ?? null;
    const pageStatus = !pageByAsset.has(asset.id)
      ? "missing"
      : pageByAsset.get(asset.id)
        ? "published"
        : "draft";
    const readiness = assetReadiness({
      public_status: asset.public_status,
      qrStatus: qr?.status ?? null,
      pageStatus,
    });
    const activity = perAsset.get(asset.id);
    return {
      id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.asset_name,
      shortCode: qr?.short_code ?? null,
      readiness,
      totalScans: activity?.totalScans ?? 0,
      lastScannedAt: activity?.lastScannedAt ?? null,
      submissionCount: activity?.submissionCount ?? 0,
    };
  });
  const sortedRows = sortAssetRows(assetRows, sort);

  // Top assets by scans (visual bars; independent of the table's chosen sort).
  const topByScans = sortAssetRows(assetRows, "scans_desc")
    .filter((r) => r.totalScans > 0)
    .slice(0, 5);
  const topScanMax = Math.max(1, ...topByScans.map((r) => r.totalScans));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Analytics"
        description="Scan and submission activity for your organization."
      />

      {/* Overview */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Assets" value={assets.length} />
          <StatCard label="Active QR links" value={activeQrLinks} />
          <StatCard label="Total scans" value={summary.totalScans} />
          <StatCard label="Scans (7 days)" value={summary.scans7d} />
          <StatCard label="Scans (30 days)" value={summary.scans30d} />
          <StatCard
            label="Total submissions"
            value={summary.totalSubmissions}
            href="/dashboard/submissions"
          />
          <StatCard
            label="New submissions"
            value={summary.newSubmissions}
            href="/dashboard/submissions?status=new"
          />
        </div>
      </section>

      {/* Trends (last 30 days) */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Last 30 days
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <CardTitle>Scans per day</CardTitle>
              <span className="text-xs text-muted-foreground tabular-nums">
                {summary.scans30d} total
              </span>
            </div>
            <BarChart data={scanSeries} />
          </Card>
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <CardTitle>Submissions per day</CardTitle>
              <span className="text-xs text-muted-foreground tabular-nums">
                {submissionSeries.reduce((n, d) => n + d.count, 0)} total
              </span>
            </div>
            <BarChart data={submissionSeries} />
          </Card>
        </div>
      </section>

      {/* Submissions by type + status (bars with drill-through) */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-2">Submissions by type</CardTitle>
          <div className="flex flex-col gap-1">
            {ANALYTICS_FORM_TYPES.map((t) => (
              <StatBar
                key={t}
                label={FORM_TYPE_LABELS[t]}
                value={summary.byType[t]}
                max={summary.totalSubmissions}
                href={`/dashboard/submissions?form_type=${t}`}
              />
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle className="mb-2">Submission status</CardTitle>
          <div className="flex flex-col gap-1">
            {SUBMISSION_STATUSES.map((s) => (
              <StatBar
                key={s}
                label={titleCase(s)}
                value={summary.byStatus[s]}
                max={summary.totalSubmissions}
                href={`/dashboard/submissions?status=${s}`}
              />
            ))}
          </div>
        </Card>
      </section>

      {/* Top assets by scan activity */}
      {topByScans.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Top assets by scans
          </h2>
          <Card>
            <div className="flex flex-col gap-1">
              {topByScans.map((row) => (
                <StatBar
                  key={row.id}
                  label={`${row.asset_code} · ${row.asset_name}`}
                  value={row.totalScans}
                  max={topScanMax}
                  href={`/dashboard/assets/${row.id}`}
                />
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {/* Per-asset activity */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Per-asset activity
        </h2>
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Short code</th>
                <th className="px-4 py-2 font-medium">Readiness</th>
                <SortHeader label="Scans" sortKey="scans_desc" current={sort} />
                <SortHeader
                  label="Last scanned"
                  sortKey="last_scanned_desc"
                  current={sort}
                />
                <SortHeader
                  label="Submissions"
                  sortKey="submissions_desc"
                  current={sort}
                />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{row.asset_code}</td>
                    <td className="px-4 py-2">{row.asset_name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {row.shortCode ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      {row.readiness.ready ? (
                        <span className="rounded-full border px-2 py-0.5 text-xs">
                          Ready
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {row.readiness.issues.join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{row.totalScans}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDateTime(row.lastScannedAt)}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      <Link
                        href={`/dashboard/submissions?asset_id=${row.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {row.submissionCount}
                      </Link>
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
