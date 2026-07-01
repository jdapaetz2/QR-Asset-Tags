import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { updateOrgSettings } from "@/lib/org/actions";
import {
  OrgSettingsForm,
  type OrgSettingsDefaults,
} from "@/components/org-settings-form";
import { NotificationSettingsForm } from "@/components/notification-settings-form";
import type { NotificationSettings } from "@/lib/notifications/settings";
import { PageHeader } from "@/components/ui/page-header";
import { PlanUsage } from "@/components/plan-usage";
import { getCoveredCount } from "@/lib/plans/coverage-query";

// Settings reads/writes are per-request and auth-scoped; never cache.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireOrgId();
  const supabase = await createClient();

  // RLS-scoped: the caller only ever sees/edits their own organization. Plan fields
  // are read-only here (platform-owner-only writes, enforced by the DB trigger).
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, support_phone, support_email, website_url, primary_color, logo_url, notification_email, notify_damage_reports, notify_support_requests, notify_return_checklists, notify_tag_request_updates, status, plan_name, asset_limit, tag_credit_cents, storage_limit_mb, video_uploads_enabled"
    )
    .maybeSingle();

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
    <div className="flex flex-col gap-6">
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
            description="Organization profile, support contact, and public scanner page branding."
          />
        </div>
      </div>

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

      <section className="max-w-2xl border-t pt-6">
        <h2 className="text-lg font-semibold tracking-tight">Plan &amp; usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your subscription and covered-asset usage. Plan changes are handled by
          AssetTag QR.
        </p>
        <div className="mt-4">
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
        </div>
      </section>

      <section className="max-w-2xl border-t pt-6">
        <h2 className="text-lg font-semibold tracking-tight">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Email alerts for public submissions and tag request updates.
        </p>
        <div className="mt-4">
          <NotificationSettingsForm settings={notificationSettings} />
        </div>
      </section>
    </div>
  );
}
