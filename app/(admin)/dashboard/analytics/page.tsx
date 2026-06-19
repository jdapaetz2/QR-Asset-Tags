import { requireOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { assetReadiness } from "@/lib/qr/production";
import {
  SUBMISSION_STATUSES,
  FORM_TYPE_LABELS,
} from "@/lib/submissions/display";
import {
  summarizeActivity,
  perAssetActivity,
  ANALYTICS_FORM_TYPES,
  type ScanRow,
  type SubmissionRow,
} from "@/lib/analytics/activity";

// Activity counts are live per request; never cache.
export const dynamic = "force-dynamic";

type AssetRow = {
  id: string;
  asset_code: string;
  asset_name: string;
  public_status: string;
};

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function AnalyticsPage() {
  // Login + org required (platform owners are redirected to their own landing).
  await requireOrgId();
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

  // Privacy: counts only — no submission contents on this page.
  const { data: subData } = await supabase
    .from("form_submissions")
    .select("asset_id, form_type, status");
  const submissions = (subData ?? []) as SubmissionRow[];

  const summary = summarizeActivity(scans, submissions);
  const perAsset = perAssetActivity(scans, submissions);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scan and submission activity for your organization.
        </p>
      </section>

      {/* Overview */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Assets" value={assets.length} />
          <Stat label="Active QR links" value={activeQrLinks} />
          <Stat label="Total scans" value={summary.totalScans} />
          <Stat label="Scans (7 days)" value={summary.scans7d} />
          <Stat label="Scans (30 days)" value={summary.scans30d} />
          <Stat label="Total submissions" value={summary.totalSubmissions} />
          <Stat label="New submissions" value={summary.newSubmissions} />
        </div>
      </section>

      {/* Submissions by type */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Submissions by type
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ANALYTICS_FORM_TYPES.map((t) => (
            <Stat key={t} label={FORM_TYPE_LABELS[t]} value={summary.byType[t]} />
          ))}
        </div>
      </section>

      {/* Submission status summary */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Submission status
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUBMISSION_STATUSES.map((s) => (
            <Stat key={s} label={titleCase(s)} value={summary.byStatus[s]} />
          ))}
        </div>
      </section>

      {/* Per-asset activity */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Per-asset activity
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Short code</th>
                <th className="px-4 py-2 font-medium">Readiness</th>
                <th className="px-4 py-2 font-medium">Scans</th>
                <th className="px-4 py-2 font-medium">Last scanned</th>
                <th className="px-4 py-2 font-medium">Submissions</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
                    No assets yet.
                  </td>
                </tr>
              ) : (
                assets.map((asset) => {
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
                  return (
                    <tr key={asset.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{asset.asset_code}</td>
                      <td className="px-4 py-2">{asset.asset_name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {qr?.short_code ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        {readiness.ready ? (
                          <span className="rounded-full border px-2 py-0.5 text-xs">
                            Ready
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {readiness.issues.join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {activity?.totalScans ?? 0}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatDateTime(activity?.lastScannedAt ?? null)}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {activity?.submissionCount ?? 0}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
