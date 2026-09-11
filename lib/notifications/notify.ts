import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv, serverEnv } from "@/lib/env";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";
import { readNotificationSettings, type SubmissionFormType } from "@/lib/notifications/settings";
import { buildIncidentEmail, buildTagStatusEmail, type EmailContent } from "@/lib/notifications/email";
import {
  checkSavedSubmission,
  projectSubmissionBrief,
  SAVED_SUBMISSION_COLUMNS,
  type SavedSubmissionRow,
} from "@/lib/notifications/projection";
import {
  previewRequestCount,
  resolveSubmissionRecipients,
  resolveTagStatusRecipients,
  type PlannedSend,
} from "@/lib/notifications/routing";
import { notificationIdempotencyKey } from "@/lib/notifications/idempotency";
import { sendNotificationEmail } from "@/lib/notifications/send";
import { logNotificationEvent, type NotificationEvent } from "@/lib/notifications/log";
import { buildPreviews, failedPreviews, submissionPreviewStorage, type BuiltPreviews } from "@/lib/notifications/previews";
import { previewBytesBucket } from "@/lib/notifications/preview-limits";
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
 *
 * Engineering Phase D3A: recipients come from one pure resolver (lib/notifications/routing.ts). The brief and the
 * message are built ONCE; each recipient then gets its own sequential send (never To+CC), its own idempotency key
 * (the key binds a recipient hash), and its own log line — so one recipient's failure cannot affect another's.
 *
 * Engineering Phase D4: when the organization's switch allows previews and the brief has candidates, up to three
 * bounded previews are built ONCE from the private bucket (this module's admin client, read-only) before any
 * recipient is sent to. Every route receives the identical sanitized set, the idempotency key does not change, and
 * any preview failure leaves a text-only email that is still sent.
 */

const NOTIFY_COLUMNS =
  "name, notification_email, notify_damage_reports, notify_support_requests, notify_tag_request_updates, notify_urgent_reports, urgent_notification_email, return_notification_mode, notify_include_photo_previews";

type OrgNotifyRow = { name: string | null } & Record<string, unknown>;

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

/**
 * One provider send to one recipient, with its own key and its own log line. Sequential by design (at most two per
 * event), and isolated: an exception here is logged against this recipient only and never propagates.
 */
async function deliver(args: {
  event: NotificationEvent;
  organizationId: string;
  reference: string;
  idempotencyReference: string;
  planned: PlannedSend;
  content: EmailContent;
  previewRequestedCount: number | null;
  /** The shared D4 preview result, or null when previews were not requested for this event. */
  previews: BuiltPreviews | null;
}): Promise<void> {
  const { planned, previews } = args;
  const previewFields = {
    previewRequestedCount: args.previewRequestedCount,
    previewAttachedCount: previews ? previews.attached : args.previewRequestedCount === null ? null : 0,
    previewFailureClass: previews ? previews.failureClass : null,
    previewTransformMs: previews ? previews.transformMs : null,
    previewBytesBucket: previews ? previewBytesBucket(previews.totalBytes) : null,
  };
  try {
    const idempotencyKey = notificationIdempotencyKey({
      event: args.event,
      reference: args.idempotencyReference,
      recipient: planned.recipient,
    });
    // Phase C6 instrumentation. Inert unless MULEMARK_DIAGNOSTIC_TIMING=1; returns the same result and rethrows
    // nothing new.
    const result = await time("notify", "notify.send", () =>
      sendNotificationEmail(planned.recipient, args.content, {}, {
        idempotencyKey,
        replyTo: serverEnv.notificationReplyToEmail,
      })
    );
    logNotificationEvent({
      event: args.event,
      outcome: result.outcome,
      organizationId: args.organizationId,
      reference: args.reference,
      recipient: planned.recipient,
      providerId: result.providerId,
      providerStatus: result.status,
      attempts: result.attempts,
      failureClass: result.failureClass,
      reason: result.reason,
      recipientRoute: planned.route,
      ...previewFields,
    });
  } catch (err) {
    // Recipient-isolation backstop: log this recipient's failure (no error body) and let the next send proceed.
    logNotificationEvent({
      event: args.event,
      outcome: "failed_transient",
      organizationId: args.organizationId,
      reference: args.reference,
      recipient: planned.recipient,
      failureClass: "exception",
      recipientRoute: planned.route,
    });
    void err;
  }
}

export async function notifySubmission(input: SubmissionNotificationInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select(NOTIFY_COLUMNS)
      .eq("id", input.organizationId)
      .maybeSingle<OrgNotifyRow>();
    if (!org) return;
    const settings = readNotificationSettings(org);

    // Immediate attention is the widest routing any report can receive (a return never uses the urgent route), so
    // when even that reaches nobody, skip without loading the saved record. Distinguishes "no recipient set" from
    // "disabled" for diagnosability.
    const widest = resolveSubmissionRecipients({ formType: input.formType, priority: "immediate", settings });
    if (widest.sends.length === 0) {
      logNotificationEvent({
        event: "submission",
        outcome: widest.skip ?? "skipped_disabled",
        organizationId: input.organizationId,
        reference: input.reference,
        recipient: settings.notification_email,
      });
      return;
    }

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
        recipient: settings.notification_email,
        failureClass: failure ?? "record_missing",
      });
      return;
    }

    const reference = submissionReference(row.id, row.created_at);
    const projected = await time("notify", "notify.project", async () => {
      const brief = projectSubmissionBrief({
        organizationName: org.name ?? "Your organization",
        row,
        asset: { code: asset.asset_code, name: asset.asset_name, category: asset.category },
        siteUrl: publicEnv.siteUrl,
      });
      return brief ? { brief, content: buildIncidentEmail(brief) } : null;
    });
    if (!projected) {
      logNotificationEvent({
        event: "submission",
        outcome: "failed_transient",
        organizationId: input.organizationId,
        reference,
        recipient: settings.notification_email,
        failureClass: "unsupported_record",
      });
      return;
    }

    // The real routing, from the saved record's deterministic priority.
    const routing = resolveSubmissionRecipients({
      formType: input.formType,
      priority: projected.brief.priority,
      settings,
    });
    if (routing.sends.length === 0) {
      logNotificationEvent({
        event: "submission",
        outcome: routing.skip ?? "skipped_disabled",
        organizationId: input.organizationId,
        reference,
        recipient: settings.notification_email,
      });
      return;
    }

    const requested = previewRequestCount(
      settings.notify_include_photo_previews,
      projected.brief.photos.previewCandidates.length
    );

    // D4: previews are built once, before any recipient, from this submission's own stored photos. The message is
    // rebuilt once with whatever survived; a failure of the whole step still yields a text-only message.
    let content = projected.content;
    let previews: BuiltPreviews | null = null;
    if (requested > 0) {
      previews = await time("notify", "notify.media", () =>
        buildPreviews({
          candidates: projected.brief.photos.previewCandidates,
          requested,
          owner: { organizationId: input.organizationId, assetId: input.assetId, submissionId: row.id },
          storage: submissionPreviewStorage(admin),
        })
      ).catch(() => failedPreviews(requested));
      content = buildIncidentEmail(projected.brief, previews);
    }

    for (const planned of routing.sends) {
      // A submission notifies each recipient exactly once, ever — its id plus the recipient hash is the key.
      await deliver({
        event: "submission",
        organizationId: input.organizationId,
        reference,
        idempotencyReference: row.id,
        planned,
        content,
        previewRequestedCount: requested,
        previews,
      });
    }
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

export type TagStatusNotificationInput = {
  organizationId: string;
  /** Canonical tag-request id — the reference shared with the platform owner. */
  tagRequestId: string;
  /** The persisted status before the owner's save. */
  fromStatus: string;
  /** The persisted status after the owner's save. Checked against the saved request before sending. */
  toStatus: string;
  /** The saved request's `updated_at` from that save — makes each real transition its own idempotency key. */
  changedAt: string;
};

type TagRequestRow = { id: string; organization_id: string; status: string };

/**
 * Engineering Phase D3A: called only for a real status change (lib/tags/owner-actions.ts). Fails closed when the
 * saved request is missing or has moved on to another status since the save that scheduled this email. Never carries
 * previews.
 */
export async function notifyTagRequestStatus(input: TagStatusNotificationInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select(NOTIFY_COLUMNS)
      .eq("id", input.organizationId)
      .maybeSingle<OrgNotifyRow>();
    if (!org) return;
    const settings = readNotificationSettings(org);

    const routing = resolveTagStatusRecipients(settings);
    if (routing.sends.length === 0) {
      logNotificationEvent({
        event: "tag_status",
        outcome: routing.skip ?? "skipped_disabled",
        organizationId: input.organizationId,
        reference: input.tagRequestId,
        recipient: settings.notification_email,
      });
      return;
    }

    const saved = await admin
      .from("tag_requests")
      .select("id, organization_id, status")
      .eq("id", input.tagRequestId)
      .eq("organization_id", input.organizationId)
      .maybeSingle<TagRequestRow>();
    const failure = saved.error
      ? "load_error"
      : !saved.data
        ? "record_missing"
        : saved.data.status !== input.toStatus
          ? "stale_transition"
          : null;
    if (failure || !saved.data) {
      logNotificationEvent({
        event: "tag_status",
        outcome: "failed_transient",
        organizationId: input.organizationId,
        reference: input.tagRequestId,
        recipient: settings.notification_email,
        failureClass: failure ?? "record_missing",
      });
      return;
    }

    const content = buildTagStatusEmail({
      orgName: org.name ?? "Your organization",
      statusLabel: tagRequestStatusLabel(saved.data.status),
      reference: input.tagRequestId,
      manageUrl: `${publicEnv.siteUrl}/dashboard/tag-requests/${encodeURIComponent(input.tagRequestId)}`,
      settingsUrl: `${publicEnv.siteUrl}/dashboard/settings`,
    });

    // Each real transition is its own key: `ready → delivered` saved at a given moment sends once, a replay of that
    // save is a no-op, and a later genuine re-delivery (a different saved moment) is a new email.
    const changedAtMs = Date.parse(input.changedAt);
    const idempotencyReference = `${input.tagRequestId}:${input.fromStatus}-${input.toStatus}:${
      Number.isFinite(changedAtMs) ? changedAtMs : "unknown"
    }`;

    for (const planned of routing.sends) {
      await deliver({
        event: "tag_status",
        organizationId: input.organizationId,
        reference: input.tagRequestId,
        idempotencyReference,
        planned,
        content,
        previewRequestedCount: null,
        previews: null,
      });
    }
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
