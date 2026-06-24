import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { formTypeLabel } from "@/lib/submissions/display";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";
import {
  shouldNotifySubmission,
  type NotificationSettings,
  type SubmissionFormType,
} from "@/lib/notifications/settings";
import {
  buildSubmissionEmail,
  buildTagStatusEmail,
} from "@/lib/notifications/email";
import { sendNotificationEmail } from "@/lib/notifications/send";

/**
 * Notification orchestration. Reads an organization's notification settings with
 * the SERVICE-ROLE admin client because the triggering contexts are trusted server
 * code that can't otherwise read these private columns: the public submission
 * intake uses the anon client (no access to settings), and the settings columns are
 * not in the anon grant. This mirrors the sanctioned use of service-role for public
 * submission intake (see lib/supabase/admin.ts).
 *
 * Every function swallows its own errors — a notification must never break the
 * submission or status update that triggered it.
 */

const NOTIFY_COLUMNS =
  "name, notification_email, notify_damage_reports, notify_support_requests, notify_return_checklists, notify_tag_request_updates";

type OrgNotifyRow = { name: string | null } & NotificationSettings;

type SubmittedBy = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export async function notifySubmission(input: {
  organizationId: string;
  formType: SubmissionFormType;
  assetId: string;
  submittedBy: SubmittedBy;
  submissionId: string;
  summary?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select(NOTIFY_COLUMNS)
      .eq("id", input.organizationId)
      .maybeSingle<OrgNotifyRow>();
    if (!org) return;

    if (!shouldNotifySubmission(input.formType, org)) return;

    const { data: asset } = await admin
      .from("assets")
      .select("asset_code, asset_name, category")
      .eq("id", input.assetId)
      .maybeSingle<{
        asset_code: string | null;
        asset_name: string | null;
        category: string | null;
      }>();

    const content = buildSubmissionEmail({
      orgName: org.name ?? "Your organization",
      formTypeLabel: formTypeLabel(input.formType),
      asset: {
        code: asset?.asset_code ?? null,
        name: asset?.asset_name ?? null,
        category: asset?.category ?? null,
      },
      submittedBy: input.submittedBy,
      summary: input.summary ?? "",
      adminUrl: `${publicEnv.siteUrl}/dashboard/submissions/${input.submissionId}`,
    });

    await sendNotificationEmail(org.notification_email!, content);
  } catch (err) {
    console.error("[notifications] notifySubmission failed (ignored):", err);
  }
}

export async function notifyTagRequestStatus(input: {
  organizationId: string;
  status: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select(NOTIFY_COLUMNS)
      .eq("id", input.organizationId)
      .maybeSingle<OrgNotifyRow>();
    if (!org) return;
    if (!org.notification_email || !org.notify_tag_request_updates) return;

    const content = buildTagStatusEmail({
      orgName: org.name ?? "Your organization",
      statusLabel: tagRequestStatusLabel(input.status),
      manageUrl: `${publicEnv.siteUrl}/dashboard/tag-requests`,
    });

    await sendNotificationEmail(org.notification_email, content);
  } catch (err) {
    console.error("[notifications] notifyTagRequestStatus failed (ignored):", err);
  }
}
