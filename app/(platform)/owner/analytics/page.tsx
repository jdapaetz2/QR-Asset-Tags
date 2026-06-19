import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";

// Cross-org counts are live per request; never cache.
export const dynamic = "force-dynamic";

type OrgRow = { id: string; name: string };

function tally(
  rows: { organization_id: string }[] | null
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows ?? []) {
    map.set(r.organization_id, (map.get(r.organization_id) ?? 0) + 1);
  }
  return map;
}

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

  const { data: assetData } = await supabase
    .from("assets")
    .select("organization_id");
  const { data: scanData } = await supabase
    .from("scan_events")
    .select("organization_id");
  const { data: subData } = await supabase
    .from("form_submissions")
    .select("organization_id");

  const assetCounts = tally(assetData as { organization_id: string }[] | null);
  const scanCounts = tally(scanData as { organization_id: string }[] | null);
  const subCounts = tally(subData as { organization_id: string }[] | null);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organization-level activity summary.
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
              orgs.map((org) => (
                <tr key={org.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{org.name}</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">
                    {assetCounts.get(org.id) ?? 0}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">
                    {scanCounts.get(org.id) ?? 0}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">
                    {subCounts.get(org.id) ?? 0}
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
