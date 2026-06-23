import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_name: string | null;
  asset_limit: number | null;
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
    .select("id, name, slug, status, plan_name, asset_limit, created_at")
    .order("created_at", { ascending: true });

  const orgs = (data ?? []) as OrgRow[];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {orgs.length} organization{orgs.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </section>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Slug</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Asset limit</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  No organizations yet.
                </td>
              </tr>
            ) : (
              orgs.map((org) => (
                <tr key={org.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{org.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{org.slug}</td>
                  <td className="px-4 py-2">{org.status}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {org.plan_name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {org.asset_limit ?? "—"}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
