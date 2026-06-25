import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { updateOrgSettingsAsOwner } from "@/lib/org/actions";
import {
  OrgSettingsForm,
  type OrgSettingsDefaults,
} from "@/components/org-settings-form";
import { ExportSettingsForm } from "@/components/export-settings-form";
import { toExportFlags } from "@/lib/export/types";

export const dynamic = "force-dynamic";

export default async function OwnerOrgSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await requireRole(ROLES.PLATFORM_OWNER);
  const { organizationId } = await params;
  const supabase = await createClient();

  // Platform owner can read any org (RLS owner bypass).
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, support_phone, support_email, website_url, primary_color, logo_url, customer_exports_enabled, export_assets_enabled, export_qr_mapping_enabled, export_documents_enabled, export_submissions_enabled"
    )
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) notFound();

  const exportFlags = toExportFlags(org);

  const { data: qr } = await supabase
    .from("qr_links")
    .select("short_code")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const sampleHref = qr?.short_code ? `/t/${qr.short_code}` : null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/owner"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Organizations
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {org.name ?? "Organization"} — settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Branding and support contact shown on this organization&apos;s public scan
          pages.
        </p>
      </section>

      <OrgSettingsForm
        action={updateOrgSettingsAsOwner.bind(null, organizationId)}
        org={org as OrgSettingsDefaults}
        sampleHref={sampleHref}
      />

      <section className="border-t pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Data exports</h2>
          <Link
            href={`/owner/organizations/${organizationId}/export`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Export this org&apos;s data →
          </Link>
        </div>
        <ExportSettingsForm organizationId={organizationId} flags={exportFlags} />
      </section>

      <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-muted-foreground">
        <h2 className="font-medium text-foreground">Domain durability</h2>
        <p className="mt-1">
          Physical QR tags must point at a stable production/custom domain.
          <code className="mx-1 rounded bg-background px-1">localhost</code> and Vercel
          preview URLs are for testing only. The <code>short_code</code> is durable, but
          the domain must be too — changing it after tags are produced breaks them unless
          redirects are preserved. See <code>docs/QR_DOMAIN_STRATEGY.md</code>.
        </p>
      </section>
    </div>
  );
}
