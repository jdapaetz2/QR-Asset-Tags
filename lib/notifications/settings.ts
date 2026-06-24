/**
 * Pure validation + gating for an organization's email notification settings. No
 * I/O and no `organization_id` handling — the org is always derived from the
 * signed-in profile (see lib/notifications/actions.ts). The notifier reads the
 * stored settings server-side and uses `shouldNotifySubmission` to decide whether
 * to send.
 */

export type SubmissionFormType =
  | "damage_report"
  | "support_request"
  | "return_checklist";

export type NotificationSettings = {
  notification_email: string | null;
  notify_damage_reports: boolean;
  notify_support_requests: boolean;
  notify_return_checklists: boolean;
  notify_tag_request_updates: boolean;
};

export type NotificationSettingsResult =
  | { value: NotificationSettings; error?: undefined }
  | { value?: undefined; error: string };

export type RawNotificationForm = Record<string, string | undefined>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** HTML checkboxes submit "on" (or a custom value) when checked, nothing when not. */
function readBool(value: string | undefined): boolean {
  return value === "on" || value === "true" || value === "1";
}

function cleanEmail(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalizeNotificationSettings(
  raw: RawNotificationForm
): NotificationSettingsResult {
  const notification_email = cleanEmail(raw.notification_email);
  if (notification_email && !EMAIL_RE.test(notification_email)) {
    return { error: "Notification email must be a valid email address." };
  }

  return {
    value: {
      notification_email,
      notify_damage_reports: readBool(raw.notify_damage_reports),
      notify_support_requests: readBool(raw.notify_support_requests),
      notify_return_checklists: readBool(raw.notify_return_checklists),
      notify_tag_request_updates: readBool(raw.notify_tag_request_updates),
    },
  };
}

/** Per-form-type flag lookup, so the gate stays in one place. */
const SUBMISSION_FLAG: Record<SubmissionFormType, keyof NotificationSettings> = {
  damage_report: "notify_damage_reports",
  support_request: "notify_support_requests",
  return_checklist: "notify_return_checklists",
};

/**
 * Whether a submission of `formType` should trigger an email: a notification
 * address must be set AND that form type's flag enabled.
 */
export function shouldNotifySubmission(
  formType: SubmissionFormType,
  settings: NotificationSettings
): boolean {
  if (!settings.notification_email) return false;
  return Boolean(settings[SUBMISSION_FLAG[formType]]);
}
