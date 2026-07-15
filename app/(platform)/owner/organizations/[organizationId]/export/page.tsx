import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { EXPORT_TYPES } from "@/lib/export/types";
import { OwnerOrgSubnav } from "@/components/owner/org-subnav";

export const dynamic = "force-dynamic";

export default async function OwnerOrgExportPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await requireRole(ROLES.PLATFORM_OWNER);
  const { organizationId } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) notFound();

  return (
    <div className="flex flex-col gap-6">
      <OwnerOrgSubnav
        orgId={organizationId}
        orgName={org.name ?? "Organization"}
        active="export"
      />
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          Export — {org.name ?? "Organization"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform-admin export for support, offboarding, and data handoff. Always
          available regardless of the org&apos;s customer-export toggles.
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Download CSV</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {EXPORT_TYPES.map((t) => (
            <li key={t.key} className="flex items-center justify-between gap-3">
              <span>{t.label}</span>
              <a
                href={`/owner/organizations/${organizationId}/export/download?type=${t.key}`}
                className="rounded-md border px-3 py-1.5 underline-offset-4 hover:bg-accent hover:text-accent-foreground"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Templates, tag requests, and timeline/acknowledgement exports are deferred —
          provide those via a manual support export for now. Private media files are not
          included in CSVs.
        </p>
      </section>
    </div>
  );
}
