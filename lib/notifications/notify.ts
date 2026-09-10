import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv, serverEnv } from "@/lib/env";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";
import {
  shouldNotifySubmission,
  type NotificationSettings,
  type SubmissionFormType,
} from "@/lib/notifications/settings";
import { buildIncidentEmail, buildTagStatusEmail } from "@/lib/notifications/email";
import {
  checkSavedSubmission,
  projectSubmissionBrief,
  SAVED_SUBMISSION_COLUMNS,
  type SavedSubmissionRow,
} from "@/lib/notifications/projection";
import { notificationIdempotencyKey } from "@/lib/notifications/idempotency";
import { sendNotificationEmail } from "@/lib/notifications/send";
import { logNotificationEvent } from "@/lib/notifications/log";
import { submissionReference } from "@/lib/submissions/inbox";
import { time } from "@/lib/diagnostics/server-timing";

/**
 * Notification orchestration. Reads with the SERVICE-ROLE admin client because the triggering contexts are trusted
 * server code that can't otherwise read these rows: the public submission intake uses the anon client (which can
 * insert but never read a submission back), and the notification settings columns are not in the anon grant. This
 * mirrors the sanctioned use of service-role for public submission intake (see lib/supabase/admin.ts).
 *
 * Every function swallows its own errors — a notification must never break the submission or status update that
 * triggered it.
 *
 * Phase B4: each event derives a deterministic provider idempotency key from the record it is about, so a retry (or
 * a replayed server action) cannot produce a second email to a real customer. Every URL is computed from
 * `publicEnv.siteUrl`, the canonical production host.
 *
 * Engineering Phase D1: a submission email is built from the COMMITTED row, never from values carried across the
 * commit. The scheduled payload holds identifiers only; this function loads the saved submission and the asset,
 * refuses anything that does not match what the committing action scheduled, projects one brief, and renders it.
 */

const NOTIFY_COLUMNS =
  "name, notification_email, notify_damage_reports, notify_support_requests, notify_return_checklists, notify_tag_request_updates";

type OrgNotifyRow = { name: string | null } & NotificationSettings;

type AssetRow = { asset_code: string | null; asset_name: string | null; category: string | null };

export type SubmissionNotificationInput = {
  organizationId: string;
  assetId: string;
  submissionId: string;
  /** Canonical reference computed at commit time. Used only to correlate log lines until the row is loaded. */
  reference: string;
  /** The form type the committing action wrote — checked against the saved row, never trusted on its own. */
  formType: SubmissionFormType;
};

export async function notifySubmission(input: SubmissionNotificationInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select(NOTIFY_COLUMNS)
      .eq("id", input.organizationId)
      .maybeSingle<OrgNotifyRow>();
    if (!org) return;

    // Explicitly distinguish "no recipient set" from "this event type is disabled" for diagnosability.
    if (!org.notification_email) {
      logNotificationEvent({
        event: "submission",
        outcome: "skipped_no_recipient",
        organizationId: input.organizationId,
        reference: input.reference,
      });
      return;
    }
    if (!shouldNotifySubmission(input.formType, org)) {
      logNotificationEvent({
        event: "submission",
        outcome: "skipped_disabled",
        organizationId: input.organizationId,
        reference: input.reference,
        recipient: org.notification_email,
      });
      return;
    }
    const recipient = org.notification_email;

    // D1: the saved record and the asset, read in parallel. The asset must belong to the scheduling organization.
    const loaded = await time("notify", "notify.load", async () => {
      const [saved, assetResult] = await Promise.all([
        admin
          .from("form_submissions")
          .select(SAVED_SUBMISSION_COLUMNS)
          .eq("id", input.submissionId)
          .maybeSingle<SavedSubmissionRow>(),
        admin
          .from("assets")
          .select("asset_code, asset_name, category")
          .eq("id", input.assetId)
          .eq("organization_id", input.organizationId)
          .maybeSingle<AssetRow>(),
      ]);
      return {
        row: saved.data ?? null,
        asset: assetResult.data ?? null,
        loadFailed: Boolean(saved.error || assetResult.error),
      };
    });

    const { row, asset } = loaded;
    const failure = loaded.loadFailed
      ? "load_error"
      : checkSavedSubmission(
          { organizationId: input.organizationId, assetId: input.assetId, formType: input.formType },
          row,
          asset ? { code: asset.asset_code, name: asset.asset_name, category: asset.category } : null
        );
    if (failure || !row || !asset) {
      // Fail closed. Only a coarse class is logged — never a value from the row.
      logNotificationEvent({
        event: "submission",
        outcome: "failed_transient",
        organizationId: input.organizationId,
        reference: input.reference,
        recipient,
        failureClass: failure ?? "record_missing",
      });
      return;
    }

    const reference = submissionReference(row.id, row.created_at);
    const content = await time("notify", "notify.project", async () => {
      const brief = projectSubmissionBrief({
        organizationName: org.name ?? "Your organization",
        row,
        asset: { code: asset.asset_code, name: asset.asset_name, category: asset.category },
        siteUrl: publicEnv.siteUrl,
      });
      return brief ? buildIncidentEmail(brief) : null;
    });
    if (!content) {
      logNotificationEvent({
        event: "submission",
        outcome: "failed_transient",
        organizationId: input.organizationId,
        reference,
        recipient,
        failureClass: "unsupported_record",
      });
      return;
    }

    // A submission notifies exactly once, ever — its id is the whole key.
    const idempotencyKey = notificationIdempotencyKey({
      event: "submission",
      reference: row.id,
      recipient,
    });

    // Phase C6 instrumentation. Inert unless MULEMARK_DIAGNOSTIC_TIMING=1; returns the same result and rethrows
    // nothing new.
    const result = await time("notify", "notify.send", () =>
      sendNotificationEmail(recipient, content, {}, { idempotencyKey, replyTo: serverEnv.notificationReplyToEmail })
    );
    logNotificationEvent({
      event: "submission",
      outcome: result.outcome,
      organizationId: input.organizationId,
      reference,
      recipient,
      providerId: result.providerId,
      providerStatus: result.status,
      attempts: result.attempts,
      failureClass: result.failureClass,
      reason: result.reason,
    });
  } catch (err) {
    // Submission-safety backstop: a notification must never break the submission. Log a redacted, structured
    // record (no error body) and move on.
    logNotificationEvent({
      event: "submission",
      outcome: "failed_transient",
      organizationId: input.organizationId,
      reference: input.reference,
      failureClass: "exception",
    });
    void err;
  }
}

export async function notifyTagRequestStatus(input: {
  organizationId: string;
  /** Canonical tag-request id — the reference shared with the platform owner, and half the dedupe key. */
  tagRequestId: string;
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
    if (!org.notification_email) {
      logNotificationEvent({
        event: "tag_status",
        outcome: "skipped_no_recipient",
        organizationId: input.organizationId,
        reference: input.tagRequestId,
      });
      return;
    }
    if (!org.notify_tag_request_updates) {
      logNotificationEvent({
        event: "tag_status",
        outcome: "skipped_disabled",
        organizationId: input.organizationId,
        reference: input.tagRequestId,
        recipient: org.notification_email,
      });
      return;
    }

    const content = buildTagStatusEmail({
      orgName: org.name ?? "Your organization",
      statusLabel: tagRequestStatusLabel(input.status),
      reference: input.tagRequestId,
      manageUrl: `${publicEnv.siteUrl}/dashboard/tag-requests/${encodeURIComponent(input.tagRequestId)}`,
      settingsUrl: `${publicEnv.siteUrl}/dashboard/settings`,
    });

    // A tag request notifies on every status CHANGE, so the status is part of the key:
    // `requested → delivered` is a new email; a replay of `delivered` is not.
    const idempotencyKey = notificationIdempotencyKey({
      event: "tag_status",
      reference: `${input.tagRequestId}:${input.status}`,
      recipient: org.notification_email,
    });

    // Phase C6 instrumentation. Inert unless MULEMARK_DIAGNOSTIC_TIMING=1; returns the same result and rethrows
    // nothing new.
    const result = await time("notify", "notify.send", () =>
      sendNotificationEmail(
        org.notification_email as string,
        content,
        {},
        { idempotencyKey, replyTo: serverEnv.notificationReplyToEmail }
      )
    );
    logNotificationEvent({
      event: "tag_status",
      outcome: result.outcome,
      organizationId: input.organizationId,
      reference: input.tagRequestId,
      recipient: org.notification_email,
      providerId: result.providerId,
      providerStatus: result.status,
      attempts: result.attempts,
      failureClass: result.failureClass,
      reason: result.reason,
    });
  } catch (err) {
    logNotificationEvent({
      event: "tag_status",
      outcome: "failed_transient",
      organizationId: input.organizationId,
      reference: input.tagRequestId,
      failureClass: "exception",
    });
    void err;
  }
}
