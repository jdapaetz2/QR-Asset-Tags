import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { unviewedCountByOrg } from "@/lib/tags/tag-requests";
import { coveredCountByOrg } from "@/lib/plans/coverage";
import { formatCents } from "@/lib/plans/presets";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { orgStatusLabel } from "@/lib/ui/status-labels";

export const dynamic = "force-dynamic";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_name: string | null;
  asset_limit: number | null;
  tag_credit_cents: number | null;
  created_at: string;
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default async function OwnerPage() {
  // Authoritative role gate: non-owners are redirected to their own landing.
  await requireRole(ROLES.PLATFORM_OWNER);

  // RLS-scoped read: the organizations policy lets a platform owner list all orgs.
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, status, plan_name, asset_limit, tag_credit_cents, created_at"
    )
    .order("created_at", { ascending: true });

  const orgs = (data ?? []) as OrgRow[];

  // Covered assets per org (owner reads all via RLS bypass): non-archived asset + link.
  const [{ data: allAssets }, { data: allQr }] = await Promise.all([
    supabase.from("assets").select("id, organization_id, archived_at"),
    supabase.from("qr_links").select("asset_id, organization_id"),
  ]);
  const coveredByOrg = coveredCountByOrg(
    (allAssets ?? []) as {
      id: string;
      organization_id: string;
      archived_at: string | null;
    }[],
    (allQr ?? []) as { asset_id: string; organization_id: string }[]
  );

  // Unviewed (new) tag requests per org — owner sees all (RLS bypass).
  const { data: unviewed } = await supabase
    .from("tag_requests")
    .select("organization_id, platform_viewed_at")
    .is("platform_viewed_at", null);
  const unviewedByOrg = unviewedCountByOrg(
    (unviewed ?? []) as {
      organization_id: string;
      platform_viewed_at: string | null;
    }[]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organizations"
        description={`${orgs.length} organization${orgs.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Link
              href="/owner/tag-requests"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Tag requests
            </Link>
            <Link
              href="/owner/analytics"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Analytics
            </Link>
            <Link
              href="/owner/users"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Users
            </Link>
            <Link
              href="/owner/organizations/new"
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
            >
              New organization
            </Link>
          </>
        }
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Slug</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Covered / limit</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Tag credit</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6">
                  <EmptyState
                    title="No organizations yet"
                    description="Organizations you onboard will appear here with their plan, covered-asset usage, and tag-request activity."
                  />
                </td>
              </tr>
            ) : (
              orgs.map((org) => {
                const newCount = unviewedByOrg.get(org.id) ?? 0;
                const covered = coveredByOrg.get(org.id) ?? 0;
                return (
                <tr key={org.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Link
                        href={`/owner/organizations/${org.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {org.name}
                      </Link>
                      {newCount > 0 ? (
                        <Link
                          href={`/owner/tag-requests?org=${org.id}&viewed=unviewed`}
                          className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-500"
                        >
                          {newCount} new
                        </Link>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{org.slug}</td>
                  <td className="px-4 py-2">
                    <Badge tone={org.status === "active" ? "success" : "neutral"}>
                      {orgStatusLabel(org.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {org.plan_name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">
                    {covered} / {org.asset_limit ?? "∞"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {formatCents(org.tag_credit_cents)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDate(org.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/owner/organizations/${org.id}/settings`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      Settings
                    </Link>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
