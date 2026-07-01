import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile, landingPathForRole } from "@/lib/auth/session";
import { roleLabel } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { safeBrandColor, readableTextOn } from "@/lib/public/brand";
import { getCoveredCount } from "@/lib/plans/coverage-query";

// Auth-scoped and reflects the org's current data; never cache.
export const dynamic = "force-dynamic";

type IconName =
  | "assets"
  | "submissions"
  | "analytics"
  | "templates"
  | "tag-requests"
  | "settings";

type ManageCard = { href: string; title: string; desc: string; icon: IconName };

const MANAGE_CARDS: ManageCard[] = [
  {
    href: "/dashboard/assets",
    title: "Assets",
    desc: "Manage equipment records, QR readiness, public pages, and rental status.",
    icon: "assets",
  },
  {
    href: "/dashboard/submissions",
    title: "Submissions",
    desc: "Review damage reports, support requests, and return checklists.",
    icon: "submissions",
  },
  {
    href: "/dashboard/analytics",
    title: "Analytics",
    desc: "Track scans, submissions, and per-asset activity.",
    icon: "analytics",
  },
  {
    href: "/dashboard/templates",
    title: "Templates",
    desc: "Manage equipment page templates for faster onboarding.",
    icon: "templates",
  },
  {
    href: "/dashboard/tag-requests",
    title: "Tag requests",
    desc: "Request physical QR tags from AssetTag QR.",
    icon: "tag-requests",
  },
  {
    href: "/dashboard/settings",
    title: "Settings",
    desc: "Manage organization profile, support contact, and scanner page branding.",
    icon: "settings",
  },
];

// Simple local line icons (no dependency). currentColor; 24x24.
const ICON_PATHS: Record<IconName, string> = {
  assets: "M21 8l-9-5-9 5v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8",
  submissions: "M22 12h-6l-2 3h-4l-2-3H2 M5 5h14l3 7v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6z",
  analytics: "M3 3v18h18 M7 14v3 M12 9v8 M17 5v12",
  templates: "M4 4h16v16H4z M4 9h16 M9 9v11",
  "tag-requests": "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-6.6-6.6A2 2 0 0 1 3.4 12.6V5a2 2 0 0 1 2-2h7.6a2 2 0 0 1 1.4.6l6.8 6.8a2 2 0 0 1 0 2z M7.5 7.5h.01",
  settings: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
};

function CardIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      {ICON_PATHS[name].split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  );
}

export default async function DashboardPage() {
  const profile = await requireProfile();

  // Platform owners have no organization; send them to their own landing.
  if (!profile.organization_id) {
    redirect(landingPathForRole(profile.role));
  }

  // RLS-scoped read: a customer admin/staff can only see their own org. Every column
  // below is already readable for the caller's own organization.
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, slug, status, support_phone, support_email, logo_url, primary_color, customer_exports_enabled, asset_limit"
    )
    .eq("id", profile.organization_id)
    .maybeSingle();

  // Covered-asset usage (RLS-scoped). Covered = non-archived asset with a QR link.
  const coveredCount = await getCoveredCount(supabase);
  const assetLimit = (org?.asset_limit as number | null) ?? null;

  // Light operational counts (RLS-scoped, head-only counts — own org only).
  const toCount = async (
    q: PromiseLike<{ count: number | null }>
  ): Promise<number> => (await q).count ?? 0;
  const [assetCount, newSubmissions, openTagRequests, rentedAssets] =
    await Promise.all([
      toCount(supabase.from("assets").select("id", { count: "exact", head: true })),
      toCount(
        supabase
          .from("form_submissions")
          .select("id", { count: "exact", head: true })
          .eq("status", "new")
      ),
      toCount(
        supabase
          .from("tag_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["requested", "in_review", "in_production", "ready"])
      ),
      toCount(
        supabase
          .from("assets")
          .select("id", { count: "exact", head: true })
          .not("active_rental_session_id", "is", null)
      ),
    ]);

  const cards: ManageCard[] = [...MANAGE_CARDS];
  if (org?.customer_exports_enabled) {
    cards.push({
      href: "/dashboard/export",
      title: "Export data",
      desc: "Download your organization's records as CSV.",
      icon: "templates",
    });
  }

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

      {/* Organization summary — branded accent bar + three zones */}
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
                {org?.status ?? "—"}
              </Badge>
              {brandingConfigured ? (
                <Badge tone="info">Scanner branding set</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-muted-foreground">
              {org?.slug ? `${org.slug} · ` : ""}
              {roleLabel(profile.role)}
            </p>
            {support.length > 0 ? (
              <p className="mt-1 text-muted-foreground">
                Support: {support.join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="px-4 pb-4 sm:pb-0 sm:pr-4">
          <Link
            href="/dashboard/settings"
            className="inline-flex w-fit rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Edit settings
          </Link>
        </div>
      </div>

      {/* Covered-asset usage (plan) */}
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Covered assets</h2>
          <span className="text-2xl font-semibold tabular-nums">
            {coveredCount}
            <span className="text-base font-normal text-muted-foreground">
              {" / "}
              {assetLimit ?? "Custom plan · no limit"}
            </span>
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Covered assets are active, non-archived assets with AssetTag QR coverage
          assigned. Scans are unlimited.
        </p>
      </section>

      {/* Operational snapshot */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          At a glance
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Assets" value={assetCount} href="/dashboard/assets" />
          <StatCard
            label="New submissions"
            value={newSubmissions}
            href="/dashboard/submissions?status=new"
          />
          <StatCard
            label="Open tag requests"
            value={openTagRequests}
            href="/dashboard/tag-requests"
          />
          <StatCard
            label="Rented assets"
            value={rentedAssets}
            href="/dashboard/assets?rental=rented"
          />
        </div>
      </section>

      {/* Manage */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Manage</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span
                  className="flex size-9 items-center justify-center rounded-md text-foreground"
                  style={{ backgroundColor: `${brand}14` }}
                  aria-hidden
                >
                  <CardIcon name={card.icon} />
                </span>
                <span
                  aria-hidden
                  className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </div>
              <h3 className="font-medium">{card.title}</h3>
              <p className="text-sm text-muted-foreground">{card.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
