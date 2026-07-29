/**
 * Phase A5 — explicit notification outcomes. Pure: no I/O, no secrets. Every notification attempt
 * resolves to exactly one of these so dry-run QA is never confused with a live provider failure, and so
 * logs/runbooks can classify what happened.
 */

export type NotificationOutcome =
  | "sent" // live provider accepted the message (2xx)
  | "dry_run" // no provider configured — intentionally simulated, nothing sent (the QA default)
  | "skipped_disabled" // the org's flag for this event type is off
  | "skipped_no_recipient" // no notification_email set for the org
  | "skipped_not_configured" // reserved: a future global notifications-off switch
  | "failed_configuration" // a key IS set but the sender/from is invalid — NOT a provider failure
  | "failed_permanent" // provider rejected and a retry cannot help (400/401/403/422)
  | "failed_transient"; // provider/network failure a retry might fix (429/5xx/network/timeout)

/** Whether an outcome means a real message left the system. Dry-run is explicitly NOT sent. */
export function isDelivered(outcome: NotificationOutcome): boolean {
  return outcome === "sent";
}

/** Whether an outcome represents a genuine failure worth operator attention (not dry-run/skips). */
export function isFailure(outcome: NotificationOutcome): boolean {
  return (
    outcome === "failed_configuration" ||
    outcome === "failed_permanent" ||
    outcome === "failed_transient"
  );
}

/**
 * Classify an HTTP status from the email provider into a terminal outcome. 2xx → sent; 400/401/403/422
 * are permanent (bad request / auth / forbidden / unprocessable — retrying is pointless); 429 and 5xx are
 * transient (rate-limited / provider hiccup — a bounded retry may help). Any other 4xx is treated as
 * permanent (a malformed request the provider understood and refused).
 */
export function classifyStatus(status: number): NotificationOutcome {
  if (status >= 200 && status < 300) return "sent";
  if (status === 429 || status >= 500) return "failed_transient";
  return "failed_permanent";
}

/** Whether a transient outcome should be retried (used by the bounded retry loop). */
export function isRetryable(outcome: NotificationOutcome): boolean {
  return outcome === "failed_transient";
}
