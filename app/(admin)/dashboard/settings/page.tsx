import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireCustomerAdminOrgId } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { toExportFlags } from "@/lib/export/types";
import { canCustomerUseExport } from "@/lib/export/access";
import { updateOrgSettings } from "@/lib/org/actions";
import {
  OrgSettingsForm,
  type OrgSettingsDefaults,
} from "@/components/org-settings-form";
import { NotificationSettingsForm } from "@/components/notification-settings-form";
import type { NotificationSettings } from "@/lib/notifications/settings";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { SecondaryNav } from "@/components/ui/secondary-nav";
import { Button } from "@/components/ui/button";
import { PlanUsage } from "@/components/plan-usage";
import { getCoveredCount } from "@/lib/plans/coverage-query";

// Settings reads/writes are per-request and auth-scoped; never cache.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Settings is org configuration → customer_admin only (staff → /dashboard). Wave 3N.1.
  await requireCustomerAdminOrgId();
  const supabase = await createClient();

  // RLS-scoped: the caller only ever sees/edits their own organization. Plan fields
  // are read-only here (platform-owner-only writes, enforced by the DB trigger).
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, support_phone, support_email, website_url, primary_color, logo_url, notification_email, notify_damage_reports, notify_support_requests, notify_return_checklists, notify_tag_request_updates, status, plan_name, asset_limit, tag_credit_cents, storage_limit_mb, video_uploads_enabled, customer_exports_enabled"
    )
    .maybeSingle();

  // Data export is a conditional secondary destination — visible only when the platform owner has enabled the org's
  // export capability. The page is already admin-only, so role is customer_admin here.
  const canExport = canCustomerUseExport({
    role: ROLES.CUSTOMER_ADMIN,
    flags: toExportFlags(org),
  });

  // Covered-asset usage (RLS-scoped read; display only, no enforcement here).
  const coveredCount = await getCoveredCount(supabase);

  const notificationSettings: NotificationSettings = {
    notification_email: org?.notification_email ?? null,
    notify_damage_reports: org?.notify_damage_reports ?? true,
    notify_support_requests: org?.notify_support_requests ?? true,
    notify_return_checklists: org?.notify_return_checklists ?? false,
    notify_tag_request_updates: org?.notify_tag_request_updates ?? false,
  };

  // A sample scan page link for the preview (first active QR link, if any).
  const { data: qr } = await supabase
    .from("qr_links")
    .select("short_code")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const sampleHref = qr?.short_code ? `/t/${qr.short_code}` : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Dashboard
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Settings"
            description="Organization profile, support contact, and branding. These settings shape your public QR scanner pages."
          />
        </div>
      </div>

      {/* In-page section index (Wave 3N.2) — every Settings destination one predictable click away. Most anchor to
          a section on this page; Team and Data export are their own routes. No duplicate settings pages. */}
      <SecondaryNav
        ariaLabel="Settings sections"
        items={[
          { label: "Organization", href: "#organization" },
          { label: "Scanner branding", href: "#branding" },
          { label: "Support contact", href: "#support" },
          { label: "Notifications", href: "#notifications" },
          { label: "Team", href: "#team" },
          ...(canExport
            ? [{ label: "Data export", href: "#data-export" }]
            : []),
        ]}
      />

      <OrgSettingsForm
        action={updateOrgSettings}
        org={(org ?? {
          name: null,
          support_phone: null,
          support_email: null,
          website_url: null,
          primary_color: null,
          logo_url: null,
        }) as OrgSettingsDefaults}
        sampleHref={sampleHref}
      />

      <SectionCard
        id="team"
        title="Team"
        description="Invite staff and manage who can access your dashboard."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/users">Manage team</Link>
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Admins can invite teammates, set roles, and disable access.
        </p>
      </SectionCard>

      {canExport ? (
        <SectionCard
          id="data-export"
          title="Data export"
          description="Download your organization's records as CSV."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/export">Open data export</Link>
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            Export the record types AssetTag QR has enabled for your organization. Private media files are not
            included.
          </p>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Plan & usage"
        description="Your subscription and covered-asset usage. Plan changes are handled by AssetTag QR."
      >
        <PlanUsage
          mode="full"
          data={{
            planName: org?.plan_name ?? "Custom plan",
            status: org?.status ?? null,
            covered: coveredCount,
            limit: (org?.asset_limit as number | null) ?? null,
            tagCreditCents: (org?.tag_credit_cents as number | null) ?? null,
            storageLimitMb: (org?.storage_limit_mb as number | null) ?? null,
            videoUploadsEnabled:
              (org?.video_uploads_enabled as boolean | null) ?? null,
          }}
        />
      </SectionCard>

      <SectionCard
        id="notifications"
        title="Notifications"
        description="Email alerts for public submissions and tag request updates."
      >
        <NotificationSettingsForm settings={notificationSettings} />
      </SectionCard>
    </div>
  );
}
