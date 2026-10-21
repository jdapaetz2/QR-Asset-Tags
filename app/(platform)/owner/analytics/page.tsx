import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { DEMO_DATA_LABEL } from "@/lib/constants";
import { getOrgActivityCounts } from "@/lib/owner/org-activity";

// Cross-org counts are live per request; never cache.
export const dynamic = "force-dynamic";

type OrgRow = { id: string; name: string };

const show = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-CA"));

export default async function OwnerAnalyticsPage() {
  // Platform admin only; clearly separate from the customer dashboard.
  await requireRole(ROLES.PLATFORM_OWNER);
  const supabase = await createClient();

  // RLS lets the platform owner read all orgs' rows (is_platform_owner bypass).
  const { data: orgData } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name", { ascending: true });
  const orgs = (orgData ?? []) as OrgRow[];

  // Exact counts per organization; demo organizations are flagged (synthetic history, not customer adoption).
  const activity = await getOrgActivityCounts(supabase, orgs.map((o) => o.id));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organization-level activity summary. Demo organizations hold synthetic history and are labelled.
          </p>
        </div>
        <Link
          href="/owner"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Organizations
        </Link>
      </section>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Organization</th>
              <th className="px-4 py-2 font-medium">Assets</th>
              <th className="px-4 py-2 font-medium">Scans</th>
              <th className="px-4 py-2 font-medium">Submissions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  No organizations yet.
                </td>
              </tr>
            ) : (
              orgs.map((org) => {
                const counts = activity.get(org.id);
                return (
                  <tr key={org.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">
                      <span>{org.name}</span>
                      {counts?.demo ? (
                        <Badge tone="neutral" className="ml-2 align-middle" data-demo-org="">
                          {DEMO_DATA_LABEL}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{show(counts?.assets)}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{show(counts?.scans)}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{show(counts?.submissions)}</td>
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
