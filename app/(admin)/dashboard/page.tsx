import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile, landingPathForRole } from "@/lib/auth/session";
import { roleLabel } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { RelativeTime } from "@/components/relative-time";
import { PlanUsage } from "@/components/plan-usage";
import { safeBrandColor, readableTextOn } from "@/lib/public/brand";
import { orgStatusLabel } from "@/lib/ui/status-labels";
import { countCoveredAssets } from "@/lib/plans/coverage";
import { deriveAssetStatus } from "@/lib/ui/status-view";
import { assetPageStatus } from "@/lib/assets/list";
import { formTypeLabel } from "@/lib/submissions/display";
import {
  buildAttentionItems,
  mergeRecentActivity,
  setupProgress,
  type ActivityEvent,
  type AttentionAsset,
  type AttentionItem,
} from "@/lib/dashboard/briefing";

// Auth-scoped and reflects the org's current data; never cache.
export const dynamic = "force-dynamic";

const UNRESOLVED = ["new", "reviewed"] as const;
const OPEN_TAG_STATUSES = ["requested", "in_review", "in_production", "ready"] as const;

type AssetRow = {
  id: string;
  asset_code: string;
  asset_name: string;
  public_status: string;
  archived_at: string | null;
  active_rental_session_id: string | null;
};

export default async function DashboardPage() {
  const profile = await requireProfile();

  // Platform owners have no organization; send them to their own landing.
  if (!profile.organization_id) {
    redirect(landingPathForRole(profile.role));
  }

  const supabase = await createClient();

  // One parallel batch of RLS-scoped, head/limited reads — the whole briefing derives from these.
  const [
    { data: org },
    { data: assetData },
    { data: qrData },
    { data: pageData },
    { data: subData },
    { count: openTagRequests },
    { data: scanData },
    { data: recentSubData },
    { data: recentTagData },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "name, slug, status, support_phone, support_email, logo_url, primary_color, customer_exports_enabled, asset_limit, plan_name"
      )
      .eq("id", profile.organization_id)
      .maybeSingle(),
    supabase
      .from("assets")
      .select("id, asset_code, asset_name, public_status, archived_at, active_rental_session_id"),
    supabase.from("qr_links").select("asset_id, status"),
    supabase.from("equipment_pages").select("asset_id, is_published"),
    supabase
      .from("form_submissions")
      .select("asset_id, form_type, status")
      .in("status", UNRESOLVED as readonly string[]),
    supabase
      .from("tag_requests")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_TAG_STATUSES as readonly string[]),
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
  ]);

  const assets = (assetData ?? []) as AssetRow[];
  const qrRows = (qrData ?? []) as { asset_id: string; status: string }[];
  const pageRows = (pageData ?? []) as { asset_id: string; is_published: boolean }[];
  const subRows = (subData ?? []) as { asset_id: string | null; form_type: string; status: string }[];

  // Per-asset lookups.
  const qrByAsset = new Map<string, boolean>(); // asset_id → hasActive
  const qrExists = new Set<string>();
  for (const q of qrRows) {
    qrExists.add(q.asset_id);
    if (q.status === "active") qrByAsset.set(q.asset_id, true);
  }
  const pageByAsset = new Map<string, boolean>();
  for (const p of pageRows) pageByAsset.set(p.asset_id, p.is_published);

  const unresolvedByAsset = new Map<string, { count: number; hasOpenDamage: boolean }>();
  for (const s of subRows) {
    if (!s.asset_id) continue;
    const prev = unresolvedByAsset.get(s.asset_id) ?? { count: 0, hasOpenDamage: false };
    unresolvedByAsset.set(s.asset_id, {
      count: prev.count + 1,
      hasOpenDamage: prev.hasOpenDamage || s.form_type === "damage_report",
    });
  }

  const codeById = new Map<string, string>();
  for (const a of assets) codeById.set(a.id, a.asset_code);

  const active = assets.filter((a) => a.archived_at === null);

  // Derive per-asset readiness for setup progress + needs-attention.
  const attentionAssets: AttentionAsset[] = active.map((a) => {
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
    const u = unresolvedByAsset.get(a.id);
    return {
      id: a.id,
      code: a.asset_code,
      name: a.asset_name,
      rented: a.active_rental_session_id !== null,
      readiness,
      unresolvedCount: u?.count ?? 0,
      hasOpenDamage: u?.hasOpenDamage ?? false,
    };
  });

  const progress = setupProgress(attentionAssets.map((a) => ({ ready: a.readiness.ready })));
  const attention = buildAttentionItems(attentionAssets, { cap: 10 });

  // Stats derived in-memory from the fetched rows.
  const covered = countCoveredAssets(
    active.map((a) => a.id),
    qrRows.map((q) => q.asset_id)
  );
  const rentedCount = assets.filter((a) => a.active_rental_session_id !== null).length;
  const unresolvedCount = subRows.length;
  const newCount = subRows.filter((s) => s.status === "new").length;

  // Recent activity feed.
  const scanEvents: ActivityEvent[] = (
    (scanData ?? []) as { asset_id: string; scanned_at: string }[]
  ).map((s) => ({
    kind: "scan",
    at: s.scanned_at,
    label: "Scanned",
    code: codeById.get(s.asset_id) ?? null,
    assetId: s.asset_id,
    href: `/dashboard/assets/${s.asset_id}`,
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
  const tagEvents: ActivityEvent[] = (
    (recentTagData ?? []) as { status: string; created_at: string }[]
  ).map((t) => ({
    kind: "tag_request",
    at: t.created_at,
    label: `Tag request · ${t.status}`,
    href: "/dashboard/tag-requests",
  }));
  const activity = mergeRecentActivity(
    [...scanEvents, ...submissionEvents, ...tagEvents],
    10
  );

  const assetLimit = (org?.asset_limit as number | null) ?? null;
  const orgName = org?.name ?? "Your organization";
  const brand = safeBrandColor(org?.primary_color);
  const brandText = readableTextOn(brand);
  const brandingConfigured = Boolean(org?.primary_color || org?.logo_url);
  const support = [org?.support_phone, org?.support_email].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={orgName}
        description={`Signed in as ${
          profile.name ?? profile.email ?? "user"
        } · ${roleLabel(profile.role)}`}
      />

      {/* Organization summary — the one place tenant branding leads. */}
      <div
        className="flex flex-col gap-4 overflow-hidden rounded-lg border bg-card sm:flex-row sm:items-center sm:justify-between"
        style={{ borderLeftWidth: 4, borderLeftColor: brand }}
      >
        <div className="flex items-center gap-4 p-4">
          {org?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logo_url}
              alt={orgName}
              className="size-12 rounded-md border bg-background object-contain"
            />
          ) : (
            <div
              className="flex size-12 items-center justify-center rounded-md text-lg font-semibold"
              style={{ backgroundColor: brand, color: brandText }}
              aria-hidden
            >
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{orgName}</span>
              <Badge tone={org?.status === "active" ? "success" : "neutral"}>
                {orgStatusLabel(org?.status)}
              </Badge>
              {brandingConfigured ? <Badge tone="info">Scanner branding set</Badge> : null}
            </div>
            <p className="mt-1 text-muted-foreground">
              {org?.slug ? `${org.slug} · ` : ""}
              {roleLabel(profile.role)}
            </p>
            {support.length > 0 ? (
              <p className="mt-1 text-muted-foreground">Support: {support.join(" · ")}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 px-4 pb-4 sm:items-end sm:pb-0 sm:pr-4">
          <PlanUsage
            mode="compact"
            compactLabel="Plan & usage"
            data={{
              planName: org?.plan_name ?? "Custom plan",
              status: org?.status ?? null,
              covered,
              limit: assetLimit,
            }}
          />
          <Link
            href="/dashboard/settings"
            className="inline-flex w-fit rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Edit settings
          </Link>
        </div>
      </div>

      {/* Needs attention — the top of the briefing. */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Needs attention</h2>
        {attention.length === 0 ? (
          <EmptyState
            title="Everything looks ready"
            description="No open submissions or setup gaps right now. New reports and readiness issues will show up here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {attention.map((item) => (
              <AttentionRow key={item.key} item={item} />
            ))}
          </ul>
        )}
      </section>

      {/* Setup progress — derived, hidden once every asset is ready. */}
      {progress.total > 0 && !progress.complete ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Setup progress</h2>
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {progress.ready} of {progress.total} assets ready
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round((progress.ready / progress.total) * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${(progress.ready / progress.total) * 100}%` }}
              />
            </div>
            <ul className="flex flex-col gap-1.5">
              {attention
                .filter((i) => i.key.endsWith(":setup"))
                .slice(0, 3)
                .map((i) => (
                  <li key={i.key}>
                    <Link
                      href={i.href}
                      className="flex flex-wrap items-center gap-2 text-sm underline-offset-4 hover:underline"
                    >
                      <AssetTagChip code={i.code} />
                      <span className="text-muted-foreground">{i.title}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* At a glance — every number links to a filtered view. */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">At a glance</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Assets" value={assets.length} href="/dashboard/assets" />
          <StatCard label="Covered assets" value={covered} href="/dashboard/settings" />
          <StatCard
            label="Assets ready"
            value={progress.ready}
            href="/dashboard/assets?page=published"
          />
          <StatCard
            label="Rented"
            value={rentedCount}
            href="/dashboard/assets?rental=rented"
          />
          <StatCard
            label="New submissions"
            value={newCount}
            href="/dashboard/submissions?status=new"
          />
          <StatCard
            label="Unresolved submissions"
            value={unresolvedCount}
            href="/dashboard/submissions"
          />
          <StatCard
            label="Open tag requests"
            value={openTagRequests ?? 0}
            href="/dashboard/tag-requests"
          />
        </div>
      </section>

      {/* Recent activity — quiet single-line feed. */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent activity</h2>
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
                <span className="ml-auto text-xs text-muted-foreground">
                  <RelativeTime value={e.at} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* More — nav-absent destinations, kept reachable without duplicating the header nav. */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">More</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/dashboard/templates" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Page templates
          </Link>
          {org?.customer_exports_enabled ? (
            <Link href="/dashboard/export" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Export data
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

const ATTENTION_STYLE: Record<AttentionItem["tone"], string> = {
  danger: "border-l-danger",
  warning: "border-l-warning",
};

/** One needs-attention row — chip + title + reason + a link to the fix page. */
function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <li>
      <Link
        href={item.href}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-l-4 bg-card p-3 hover:bg-accent/40 ${ATTENTION_STYLE[item.tone]}`}
      >
        <AssetTagChip code={item.code} />
        <span className="font-medium">{item.title}</span>
        <span className="text-sm text-muted-foreground">{item.reason}</span>
        <span aria-hidden className="ml-auto text-muted-foreground">
          →
        </span>
      </Link>
    </li>
  );
}
