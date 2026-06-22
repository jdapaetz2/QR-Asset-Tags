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
    .select("name, support_phone, support_email, website_url, primary_color, logo_url")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) notFound();

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
    </div>
  );
}
