import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { orgStatusLabel } from "@/lib/ui/status-labels";
import { countCoveredAssets } from "@/lib/plans/coverage";
import { formatCents } from "@/lib/plans/presets";

export const dynamic = "force-dynamic";

type OrgDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_name: string | null;
  asset_limit: number | null;
  tag_credit_cents: number | null;
  support_phone: string | null;
  support_email: string | null;
  website_url: string | null;
  primary_color: string | null;
  logo_url: string | null;
  powered_by_label: string | null;
  customer_exports_enabled: boolean | null;
};

export default async function OwnerOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await requireRole(ROLES.PLATFORM_OWNER);
  const { organizationId } = await params;

  const supabase = await createClient();

  // Owner RLS can read any org; a bad id returns no row → 404.
  const { data } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, status, plan_name, asset_limit, tag_credit_cents, support_phone, support_email, website_url, primary_color, logo_url, powered_by_label, customer_exports_enabled"
    )
    .eq("id", organizationId)
    .maybeSingle();
  if (!data) notFound();
  const org = data as OrgDetail;

  // Covered-asset count for this org (owner reads all via RLS): non-archived asset + link.
  const toCount = async (
    q: PromiseLike<{ count: number | null }>
  ): Promise<number> => (await q).count ?? 0;

  const [{ data: assetRows }, { data: qrRows }, userCount, tagRequestCount, assetCount] =
    await Promise.all([
      supabase
        .from("assets")
        .select("id, archived_at")
        .eq("organization_id", organizationId),
      supabase
        .from("qr_links")
        .select("asset_id")
        .eq("organization_id", organizationId),
      toCount(
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
      ),
      toCount(
        supabase
          .from("tag_requests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
      ),
      toCount(
        supabase
          .from("assets")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
      ),
    ]);

  const nonArchivedIds = ((assetRows ?? []) as { id: string; archived_at: string | null }[])
    .filter((a) => a.archived_at === null)
    .map((a) => a.id);
  const qrAssetIds = ((qrRows ?? []) as { asset_id: string }[]).map((q) => q.asset_id);
  const covered = countCoveredAssets(nonArchivedIds, qrAssetIds);

  const support = [org.support_phone, org.support_email].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/owner"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Organizations
        </Link>
        <div className="mt-2">
          <PageHeader
            title={org.name}
            description={org.slug}
            actions={
              <Link
                href={`/owner/organizations/${org.id}/settings`}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                Settings
              </Link>
            }
          />
        </div>
      </div>

      {/* Identity + plan summary */}
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={org.status === "active" ? "success" : "neutral"}>
            {orgStatusLabel(org.status)}
          </Badge>
          <span className="text-muted-foreground">
            Plan: <span className="text-foreground">{org.plan_name ?? "—"}</span>
          </span>
          <span className="text-muted-foreground">
            Tag credit:{" "}
            <span className="text-foreground">{formatCents(org.tag_credit_cents)}</span>
          </span>
          <Badge tone={org.customer_exports_enabled ? "info" : "neutral"}>
            Exports {org.customer_exports_enabled ? "enabled" : "disabled"}
          </Badge>
        </div>
        {support.length > 0 ? (
          <p className="text-muted-foreground">Support: {support.join(" · ")}</p>
        ) : (
          <p className="text-muted-foreground">No support contact set.</p>
        )}
        {org.website_url ? (
          <p className="text-muted-foreground">
            Website:{" "}
            <a
              href={org.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline-offset-4 hover:underline"
            >
              {org.website_url}
            </a>
          </p>
        ) : null}
      </section>

      {/* Counts */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">At a glance</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Assets"
            value={assetCount}
            href={`/owner/production?org=${org.id}`}
          />
          <StatCard
            label="Covered assets"
            value={`${covered} / ${org.asset_limit ?? "∞"}`}
            href={`/owner/organizations/${org.id}/settings`}
          />
          <StatCard
            label="Users"
            value={userCount}
            href={`/owner/organizations/${org.id}/users`}
          />
          <StatCard
            label="Tag requests"
            value={tagRequestCount}
            href={`/owner/tag-requests?org=${org.id}`}
          />
        </div>
      </section>

      {/* Links */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Manage</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/owner/organizations/${org.id}/settings`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Settings &amp; plan
          </Link>
          <Link
            href={`/owner/organizations/${org.id}/users`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Users
          </Link>
          <Link
            href={`/owner/organizations/${org.id}/export`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Data export
          </Link>
          <Link
            href={`/owner/production?org=${org.id}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Production
          </Link>
        </div>
      </section>
    </div>
  );
}
