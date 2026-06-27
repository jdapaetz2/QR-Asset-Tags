import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile, landingPathForRole } from "@/lib/auth/session";
import { roleLabel } from "@/lib/auth/roles";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { safeBrandColor, readableTextOn } from "@/lib/public/brand";

// Auth-scoped and reflects the org's current export toggle; never cache.
export const dynamic = "force-dynamic";

type ManageCard = { href: string; title: string; desc: string };

const MANAGE_CARDS: ManageCard[] = [
  {
    href: "/dashboard/assets",
    title: "Assets",
    desc: "Manage equipment records, QR readiness, public pages, and rental status.",
  },
  {
    href: "/dashboard/submissions",
    title: "Submissions",
    desc: "Review damage reports, support requests, and return checklists.",
  },
  {
    href: "/dashboard/analytics",
    title: "Analytics",
    desc: "Track scans, submissions, and per-asset activity.",
  },
  {
    href: "/dashboard/templates",
    title: "Templates",
    desc: "Manage equipment page templates for faster onboarding.",
  },
  {
    href: "/dashboard/tag-requests",
    title: "Tag requests",
    desc: "Request physical QR tags from AssetTag QR.",
  },
  {
    href: "/dashboard/settings",
    title: "Settings",
    desc: "Manage organization profile, support contact, and scanner page branding.",
  },
];

export default async function DashboardPage() {
  const profile = await requireProfile();

  // Platform owners have no organization; send them to their own landing.
  if (!profile.organization_id) {
    redirect(landingPathForRole(profile.role));
  }

  // RLS-scoped read: a customer admin/staff can only see their own org. All columns
  // below are already readable for the caller's own organization.
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, slug, status, support_phone, support_email, logo_url, primary_color, customer_exports_enabled"
    )
    .eq("id", profile.organization_id)
    .maybeSingle();

  const cards: ManageCard[] = [...MANAGE_CARDS];
  if (org?.customer_exports_enabled) {
    cards.push({
      href: "/dashboard/export",
      title: "Export data",
      desc: "Download your organization's records as CSV.",
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

      {/* Organization summary */}
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
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
        <Link
          href="/dashboard/settings"
          className="inline-flex w-fit rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Edit settings
        </Link>
      </Card>

      {/* Manage */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Manage</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group flex flex-col gap-2 rounded-lg border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span
                  aria-hidden
                  className="flex size-8 items-center justify-center rounded-md bg-muted text-sm font-semibold text-foreground"
                >
                  {card.title.charAt(0)}
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
