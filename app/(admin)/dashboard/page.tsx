import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile, SUSPENDED_PATH } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { firstNameToken } from "@/lib/auth/name";
import { Eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "@/components/ui/empty-state";
import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { RelativeTime } from "@/components/relative-time";
import { NameplateBand } from "@/components/dashboard/nameplate-band";
import { AttentionQueue, type QueueItem } from "@/components/dashboard/attention-queue";
import { ReturnDoneNotice } from "@/components/return-done-notice";
import { StatCard } from "@/components/ui/stat-card";
import { countCoveredAssets } from "@/lib/plans/coverage";
import { deriveAssetStatus } from "@/lib/ui/status-view";
import { assetPageStatus } from "@/lib/assets/list";
import { formTypeLabel } from "@/lib/submissions/display";
import { firstImagePath, submissionReference } from "@/lib/submissions/inbox";
import { canQuickResolveReturn } from "@/lib/submissions/returns";
import {
  buildAttentionItems,
  buildBandStats,
  buildSetupGaps,
  coverageStatus,
  mergeRecentActivity,
  rollupScanEvents,
  scanTrend,
  setupProgress,
  shouldShowSetupDetail,
  summarizeUnresolvedByAsset,
  timeGreeting,
  type ActivityEvent,
  type AttentionAsset,
} from "@/lib/dashboard/briefing";

// Auth-scoped and reflects the org's current data; never cache.
export const dynamic = "force-dynamic";

const UNRESOLVED = ["new", "reviewed"] as const;
const OPEN_TAG_STATUSES = ["requested", "in_review", "in_production", "ready"] as const;
const SUBMISSIONS_BUCKET = "submissions";
const SEVEN_DAYS_MS = 7 * 86_400_000;

type AssetRow = {
  id: string;
  asset_code: string;
  asset_name: string;
  public_status: string;
  archived_at: string | null;
  active_rental_session_id: string | null;
};

type SubRow = {
  id: string;
  asset_id: string | null;
  form_type: string;
  status: string;
  created_at: string;
  submission_data_json: Record<string, unknown> | null;
  media_urls: unknown;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_by_phone: string | null;
};

/** The quoted line for an expanded card: damage/support use `description`, returns use `condition_notes`. */
function submissionSummary(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const value = data.description ?? data.condition_notes;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const profile = await requireProfile();

  // Platform owners land on their own console — NOT the customer dashboard.
  if (profile.role === ROLES.PLATFORM_OWNER) {
    redirect("/owner");
  }
  // A customer profile with no organization can't load org-scoped data. Route it to
  // /suspended, matching the (admin) layout's requireActiveOrg guard. Never redirect to
  // /dashboard here: landingPathForRole returns "/dashboard" for non-owners, which would
  // re-enter this page and loop (the "many consecutive GET /dashboard" regression).
  if (!profile.organization_id) {
    redirect(SUSPENDED_PATH);
  }

  const sp = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  // One parallel batch of RLS-scoped, head/limited reads — the whole briefing derives from these.
  const [
    { data: org },
    { data: assetData },
    { data: qrData },
    { data: pageData },
    { data: subData },
    { count: openTagRequests },
    { data: scan7dData },
    { data: scanData },
    { data: recentSubData },
    { data: recentTagData },
    { data: rentalData },
    { count: scans30d },
    { count: submissionsCaptured },
    { count: issuesResolved },
    { count: returnsCompleted },
    { count: photoBacked },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, customer_exports_enabled, asset_limit")
      .eq("id", profile.organization_id)
      .maybeSingle(),
    supabase
      .from("assets")
      .select("id, asset_code, asset_name, public_status, archived_at, active_rental_session_id"),
    supabase.from("qr_links").select("asset_id, status"),
    supabase.from("equipment_pages").select("asset_id, is_published"),
    supabase
      .from("form_submissions")
      .select(
        "id, asset_id, form_type, status, created_at, submission_data_json, media_urls, submitted_by_name, submitted_by_email, submitted_by_phone"
      )
      .in("status", UNRESOLVED as readonly string[])
      .order("created_at", { ascending: false }),
    supabase
      .from("tag_requests")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_TAG_STATUSES as readonly string[]),
    supabase
      .from("scan_events")
      .select("scanned_at")
      .gte("scanned_at", sevenDaysAgo),
    supabase
      .from("scan_events")
      .select("asset_id, scanned_at")
      .order("scanned_at", { ascending: false })
      .limit(20),
    supabase
      .from("form_submissions")
      .select("asset_id, form_type, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("tag_requests")
      .select("status, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("asset_rental_sessions")
      .select("asset_id, started_at, returned_at")
      .order("started_at", { ascending: false })
      .limit(10),
    // Part D — "captured so far" head counts (count-only; no rows transferred).
    supabase
      .from("scan_events")
      .select("id", { count: "exact", head: true })
      .gte("scanned_at", thirtyDaysAgo),
    supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved"),
    supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_type", "return_checklist")
      .eq("status", "resolved"),
    supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .neq("media_urls", "{}"),
  ]);

  const assets = (assetData ?? []) as AssetRow[];
  const qrRows = (qrData ?? []) as { asset_id: string; status: string }[];
  const pageRows = (pageData ?? []) as { asset_id: string; is_published: boolean }[];
  const subRows = (subData ?? []) as SubRow[];

  // Per-asset lookups.
  const qrByAsset = new Map<string, boolean>(); // asset_id → hasActive
  const qrExists = new Set<string>();
  for (const q of qrRows) {
    qrExists.add(q.asset_id);
    if (q.status === "active") qrByAsset.set(q.asset_id, true);
  }
  const pageByAsset = new Map<string, boolean>();
  for (const p of pageRows) pageByAsset.set(p.asset_id, p.is_published);

  // subRows are already newest-first, so the first per asset is the latest.
  const latestSubByAsset = new Map<string, SubRow>();
  for (const s of subRows) {
    if (!s.asset_id) continue;
    if (!latestSubByAsset.has(s.asset_id)) latestSubByAsset.set(s.asset_id, s);
  }
  // Per-asset attention signals (damage/urgent/return/flags/oldest) from the unresolved rows.
  const signalsByAsset = summarizeUnresolvedByAsset(subRows);

  const codeById = new Map<string, string>();
  for (const a of assets) codeById.set(a.id, a.asset_code);

  const active = assets.filter((a) => a.archived_at === null);

  // Per-asset readiness — drives setup progress + the re-sourced Setup section only.
  // Readiness gaps are NOT attention items (they moved off the action queue).
  const readinessAssets = active.map((a) => {
    const qrStatus = qrByAsset.get(a.id)
      ? ("active" as const)
      : qrExists.has(a.id)
        ? ("disabled" as const)
        : null;
    const pageStatus = assetPageStatus(pageByAsset.has(a.id), pageByAsset.get(a.id) ?? false);
    const readiness = deriveAssetStatus({
      rented: a.active_rental_session_id !== null,
      publicStatus: a.public_status,
      qrStatus,
      pageStatus,
    }).readiness;
    return {
      id: a.id,
      code: a.asset_code,
      name: a.asset_name,
      ready: readiness.ready,
      reason: readiness.reason,
    };
  });

  // Attention assets — actionable ops only, from the unresolved submission signals.
  const attentionAssets: AttentionAsset[] = active.map((a) => {
    const sig = signalsByAsset.get(a.id);
    return {
      id: a.id,
      code: a.asset_code,
      name: a.asset_name,
      rented: a.active_rental_session_id !== null,
      unresolvedCount: sig?.unresolvedCount ?? 0,
      hasOpenDamage: sig?.hasOpenDamage ?? false,
      hasUrgentDamage: sig?.hasUrgentDamage ?? false,
      hasUnresolvedReturn: sig?.hasUnresolvedReturn ?? false,
      returnSubmissionId: sig?.returnSubmissionId ?? null,
      returnFlagsIssue: sig?.returnFlagsIssue ?? false,
      oldestUnresolvedMs: sig?.oldestUnresolvedMs ?? null,
      newestUnresolvedMs: sig?.newestUnresolvedMs ?? null,
    };
  });

  const progress = setupProgress(readinessAssets.map((a) => ({ ready: a.ready })));
  const setupGaps = buildSetupGaps(readinessAssets, 3);
  // Uncapped — the queue is the primary work list and must surface every qualifying asset.
  const attention = buildAttentionItems(attentionAssets, { now: now.getTime() });

  // Every unresolved submission grouped by asset (subRows are already newest-first).
  const subsByAsset = new Map<string, SubRow[]>();
  for (const s of subRows) {
    if (!s.asset_id) continue;
    const list = subsByAsset.get(s.asset_id);
    if (list) list.push(s);
    else subsByAsset.set(s.asset_id, [s]);
  }

  // Sign one representative photo per attention asset (the latest submission's first image).
  const thumbByAsset = new Map<string, string>();
  await Promise.all(
    attention.map(async (i) => {
      const sub = latestSubByAsset.get(i.assetId);
      const path = sub ? firstImagePath(sub.media_urls) : null;
      if (!path) return;
      const { data: signed } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .createSignedUrl(path, 3600);
      if (signed?.signedUrl) thumbByAsset.set(i.assetId, signed.signedUrl);
    })
  );

  const queueItems: QueueItem[] = attention.map((item) => {
    const subs = subsByAsset.get(item.assetId) ?? [];
    return {
      key: item.key,
      assetId: item.assetId,
      code: item.code,
      title: item.title,
      reason: item.reason,
      href: item.href,
      historyHref: `/dashboard/assets/${item.assetId}/timeline`,
      thumbUrl: thumbByAsset.get(item.assetId) ?? null,
      count: subs.length,
      // Enumerate EVERY unresolved submission for the asset — none discarded.
      submissions: subs.map((sub) => ({
        submissionId: sub.id,
        formTypeLabel: formTypeLabel(sub.form_type),
        status: sub.status,
        canReview: sub.status === "new",
        canReturn: canQuickResolveReturn({
          formType: sub.form_type,
          status: sub.status,
        }),
        description: submissionSummary(sub.submission_data_json),
        submitter:
          [sub.submitted_by_name, sub.submitted_by_phone ?? sub.submitted_by_email]
            .filter(Boolean)
            .join(" · ") || null,
        reference: submissionReference(sub.id, sub.created_at),
        createdAt: sub.created_at,
      })),
    };
  });

  // Operational pulse (Part C) — derived in-memory from the fetched rows.
  const rentedCount = active.filter((a) => a.active_rental_session_id !== null).length;
  const sparkValues = scanTrend(
    (scan7dData ?? []) as { scanned_at: string | null }[],
    7,
    now.getTime()
  );
  const scans7d = sparkValues.reduce((a, b) => a + b, 0);
  const stats = buildBandStats({
    rented: rentedCount,
    unresolved: subRows.length,
    scans7d,
    ready: progress.ready,
    totalAssets: progress.total,
  });

  // Covered-asset usage stays a commercial number (not a band stat): shown in the footer, plus an
  // optional compact warning only when close to / over the plan limit.
  const covered = countCoveredAssets(
    active.map((a) => a.id),
    qrRows.map((q) => q.asset_id)
  );
  const orgLimit = org?.asset_limit ?? null;
  const coverage = coverageStatus(covered, orgLimit);

  // Recent activity feed — meaningful events individually, raw scans rolled up to one
  // "Scanned N times" row per asset per day so the feed isn't scan spam.
  const scanEvents: ActivityEvent[] = rollupScanEvents(
    (scanData ?? []) as { asset_id: string | null; scanned_at: string | null }[]
  ).map((r) => ({
    kind: "scan",
    at: r.at,
    label: `Scanned ${r.count} time${r.count === 1 ? "" : "s"}`,
    code: codeById.get(r.assetId) ?? null,
    assetId: r.assetId,
    href: `/dashboard/assets/${r.assetId}`,
  }));
  const submissionEvents: ActivityEvent[] = (
    (recentSubData ?? []) as { asset_id: string | null; form_type: string; created_at: string }[]
  ).map((s) => ({
    kind: s.form_type === "return_checklist" ? "return" : "submission",
    at: s.created_at,
    label: formTypeLabel(s.form_type),
    code: s.asset_id ? codeById.get(s.asset_id) ?? null : null,
    assetId: s.asset_id,
    href: s.asset_id ? `/dashboard/submissions?asset_id=${s.asset_id}` : "/dashboard/submissions",
  }));
  // Rental lifecycle: one event when a session starts, one when it's returned.
  const rentalEvents: ActivityEvent[] = [];
  for (const s of (rentalData ?? []) as {
    asset_id: string;
    started_at: string;
    returned_at: string | null;
  }[]) {
    const code = codeById.get(s.asset_id) ?? null;
    const href = `/dashboard/assets/${s.asset_id}`;
    rentalEvents.push({
      kind: "rental",
      at: s.started_at,
      label: "Marked rented",
      code,
      assetId: s.asset_id,
      href,
    });
    if (s.returned_at) {
      rentalEvents.push({
        kind: "rental",
        at: s.returned_at,
        label: "Marked returned",
        code,
        assetId: s.asset_id,
        href,
      });
    }
  }
  const tagEvents: ActivityEvent[] = (
    (recentTagData ?? []) as { status: string; created_at: string }[]
  ).map((t) => ({
    kind: "tag_request",
    at: t.created_at,
    label: `Tag request · ${t.status}`,
    href: "/dashboard/tag-requests",
  }));
  const activity = mergeRecentActivity(
    [...scanEvents, ...submissionEvents, ...rentalEvents, ...tagEvents],
    8
  );

  const orgName = org?.name ?? "Your organization";
  // No first_name column exists — use the first token of the profile name, else the org name.
  const firstName = firstNameToken(profile.name) ?? orgName;
  const greeting = timeGreeting(now.getHours());
  const dateLabel = formatBandDate(now);

  return (
    <div className="flex flex-col gap-6">
      <ReturnDoneNotice done={sp.done} />
      <NameplateBand
        orgName={orgName}
        dateLabel={dateLabel}
        greeting={greeting}
        firstName={firstName}
        attentionCount={attention.length}
        stats={stats}
        sparkValues={sparkValues}
      />

      {/* Needs-attention queue — single-open accordion, top pre-expanded. */}
      {queueItems.length > 0 ? (
        <AttentionQueue items={queueItems} />
      ) : null}

      {/* Captured so far — proof-of-value directly after the work queue (DASHBOARD_SECTION_ORDER).
          Head counts only; every tile links to a filtered view. No ROI, no "calls avoided" claims. */}
      <section>
        <Eyebrow as="h2" className="mb-2.5">
          Captured so far
        </Eyebrow>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="scans · 30d"
            value={scans30d ?? 0}
            href="/dashboard/analytics?range=30"
          />
          <StatCard
            label="submissions captured"
            value={submissionsCaptured ?? 0}
            href="/dashboard/submissions?status=all_active"
          />
          <StatCard
            label="issues resolved"
            value={issuesResolved ?? 0}
            href="/dashboard/submissions?status=resolved"
          />
          <StatCard
            label="returns completed"
            value={returnsCompleted ?? 0}
            href="/dashboard/submissions?form_type=return_checklist&status=resolved"
          />
        </div>
        {(photoBacked ?? 0) > 0 ? (
          <p className="mt-2 text-xs text-iron-600">
            {photoBacked} of these came with photos.
          </p>
        ) : null}
      </section>

      {/* Recent activity — quiet single-line feed. */}
      <section>
        <Eyebrow as="h2" className="mb-2.5">
          Activity
        </Eyebrow>
        {activity.length === 0 ? (
          <EmptyState
            title="No recent activity yet"
            description="Scans, submissions, and tag requests will appear here as they happen."
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {activity.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                {e.code ? <AssetTagChip code={e.code} /> : null}
                {e.href ? (
                  <Link href={e.href} className="font-medium underline-offset-4 hover:underline">
                    {e.label}
                  </Link>
                ) : (
                  <span className="font-medium">{e.label}</span>
                )}
                <span className="ml-auto text-xs text-iron-600">
                  <RelativeTime value={e.at} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Setup progress — lowest-priority section, below Activity. Hidden once every asset is ready. */}
      {shouldShowSetupDetail(progress) ? (
        <section>
          <Eyebrow as="h2" className="mb-2.5">
            Setup progress
          </Eyebrow>
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {progress.ready} of {progress.total} assets ready
              </span>
              <span className="font-mono text-xs tabular-nums text-iron-600">
                {Math.round((progress.ready / progress.total) * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brass-500"
                style={{ width: `${(progress.ready / progress.total) * 100}%` }}
              />
            </div>
            {setupGaps.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {setupGaps.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={g.href}
                      className="flex flex-wrap items-center gap-2 text-sm underline-offset-4 hover:underline"
                    >
                      <AssetTagChip code={g.code} />
                      <span className="text-iron-600">{g.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <Link
              href="/dashboard/assets?page=draft"
              className="text-xs text-iron-600 underline-offset-4 hover:text-foreground hover:underline"
            >
              Review setup on the Assets page →
            </Link>
          </div>
        </section>
      ) : null}

      {/* Optional commercial coverage warning — only near/over the plan limit; never a band stat. */}
      {coverage ? (
        <Link
          href="/dashboard/assets?qr=has"
          className={`rounded-lg border px-4 py-2.5 text-sm underline-offset-4 hover:underline ${
            coverage.level === "over"
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-warning/30 bg-warning/10 text-warning"
          }`}
        >
          Coverage: {covered} of {orgLimit} covered assets ({coverage.pct}%).
        </Link>
      ) : null}

      {/* More — routes not in the header nav, kept reachable (see plan deviation #6). */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-iron-600">
        <Link
          href="/dashboard/templates"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Page templates
        </Link>
        <Link
          href="/dashboard/templates/return-inspections"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Return inspections
        </Link>
        {org?.customer_exports_enabled ? (
          <Link
            href="/dashboard/export"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Export data
          </Link>
        ) : null}
        <span className="text-mono-meta">
          {covered} covered · {openTagRequests ?? 0} open tag requests
        </span>
      </div>
    </div>
  );
}

/** "THU · JUL 9 · 2026" — the mono date stamp for the nameplate. */
function formatBandDate(d: Date): string {
  const wd = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const mo = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${wd} · ${mo} ${d.getDate()} · ${d.getFullYear()}`;
}
