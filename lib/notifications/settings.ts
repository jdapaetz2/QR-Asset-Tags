/**
 * Pure validation for an organization's email notification settings. No I/O and no `organization_id` handling —
 * the org is always derived from the signed-in profile (see lib/notifications/actions.ts). Who receives a given
 * notification is decided by lib/notifications/routing.ts from the stored settings.
 *
 * Engineering Phase D3A: an urgent route (switch + address) independent of the damage/support general switches, an
 * explicit return mode, and a photo-preview switch. `return_notification_mode` is authoritative; the legacy
 * `notify_return_checklists` boolean is only mirrored for rollback safety (migration 0034).
 */

export type SubmissionFormType =
  | "damage_report"
  | "support_request"
  | "return_checklist";

export const RETURN_NOTIFICATION_MODES = ["instant_renter", "daily_exceptions", "off"] as const;
export type ReturnNotificationMode = (typeof RETURN_NOTIFICATION_MODES)[number];

export function isReturnNotificationMode(value: unknown): value is ReturnNotificationMode {
  return typeof value === "string" && (RETURN_NOTIFICATION_MODES as readonly string[]).includes(value);
}

export type NotificationSettings = {
  /** The general (main) route address. */
  notification_email: string | null;
  notify_damage_reports: boolean;
  notify_support_requests: boolean;
  notify_tag_request_updates: boolean;
  /** Urgent route switch — Immediate-attention damage and support reports, regardless of the general switches. */
  notify_urgent_reports: boolean;
  urgent_notification_email: string | null;
  return_notification_mode: ReturnNotificationMode;
  notify_include_photo_previews: boolean;
};

/** What the settings action writes: the settings plus the legacy return boolean, mirrored from the mode. */
export type NotificationSettingsUpdate = NotificationSettings & { notify_return_checklists: boolean };

/** The column defaults (0012 + 0034). Used wherever a stored value is missing. */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notification_email: null,
  notify_damage_reports: true,
  notify_support_requests: true,
  notify_tag_request_updates: false,
  notify_urgent_reports: false,
  urgent_notification_email: null,
  return_notification_mode: "off",
  notify_include_photo_previews: true,
};

export type NotificationSettingsResult =
  | { value: NotificationSettingsUpdate; error?: undefined }
  | { value?: undefined; error: string };

export type RawNotificationForm = Record<string, string | undefined>;

export const NOTIFICATION_EMAIL_MAX_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A syntactically usable address. Applied to form input AND to stored values before any send. */
export function isValidNotificationEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= NOTIFICATION_EMAIL_MAX_LENGTH && EMAIL_RE.test(value);
}

/** HTML checkboxes submit "on" (or a custom value) when checked, nothing when not. */
function readBool(value: string | undefined): boolean {
  return value === "on" || value === "true" || value === "1";
}

function cleanEmail(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalizeNotificationSettings(raw: RawNotificationForm): NotificationSettingsResult {
  const notification_email = cleanEmail(raw.notification_email);
  if (notification_email && !isValidNotificationEmail(notification_email)) {
    return { error: "Notification email must be a valid email address." };
  }

  // Validated whenever present, even with the switch off, so a re-enable never inherits a bad address.
  const urgent_notification_email = cleanEmail(raw.urgent_notification_email);
  if (urgent_notification_email && !isValidNotificationEmail(urgent_notification_email)) {
    return { error: "Urgent notification email must be a valid email address." };
  }
  const notify_urgent_reports = readBool(raw.notify_urgent_reports);
  if (notify_urgent_reports && !urgent_notification_email) {
    return { error: "Add an urgent notification email to turn on urgent notifications." };
  }

  const return_notification_mode = raw.return_notification_mode;
  if (!isReturnNotificationMode(return_notification_mode)) {
    return { error: "Choose how return checklists are handled." };
  }
  if (return_notification_mode !== "off" && !notification_email) {
    return { error: "Add a notification email to receive return checklist notifications." };
  }

  return {
    value: {
      notification_email,
      notify_damage_reports: readBool(raw.notify_damage_reports),
      notify_support_requests: readBool(raw.notify_support_requests),
      notify_tag_request_updates: readBool(raw.notify_tag_request_updates),
      notify_urgent_reports,
      urgent_notification_email,
      return_notification_mode,
      notify_include_photo_previews: readBool(raw.notify_include_photo_previews),
      notify_return_checklists: return_notification_mode === "instant_renter",
    },
  };
}

function storedBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function storedText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** A stored organization row as settings, with the column defaults for anything missing or malformed. */
export function readNotificationSettings(row: Record<string, unknown> | null | undefined): NotificationSettings {
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  const r = row ?? {};
  return {
    notification_email: storedText(r.notification_email),
    notify_damage_reports: storedBool(r.notify_damage_reports, d.notify_damage_reports),
    notify_support_requests: storedBool(r.notify_support_requests, d.notify_support_requests),
    notify_tag_request_updates: storedBool(r.notify_tag_request_updates, d.notify_tag_request_updates),
    notify_urgent_reports: storedBool(r.notify_urgent_reports, d.notify_urgent_reports),
    urgent_notification_email: storedText(r.urgent_notification_email),
    return_notification_mode: isReturnNotificationMode(r.return_notification_mode)
      ? r.return_notification_mode
      : d.return_notification_mode,
    notify_include_photo_previews: storedBool(r.notify_include_photo_previews, d.notify_include_photo_previews),
  };
}
