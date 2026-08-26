import "server-only";

import { deploymentContext } from "@/lib/env";
import { isFailure, type NotificationOutcome } from "@/lib/notifications/outcome";

/**
 * Phase A5 — structured, redacted notification logging. Emits ONE `[notifications]` JSON line per
 * attempt so dry-run QA and future live failures are diagnosable from Vercel logs alone (no durable
 * table — see docs/EMAIL_DELIVERABILITY_RUNBOOK.md).
 *
 * It only ever emits SAFE fields: event, outcome, org id (a UUID), reference, the recipient DOMAIN and a
 * REDACTED recipient, and provider metadata (id/status/attempts/failure class). It never logs the message
 * body, a media URL, the API key/secret, the auth header, or a raw IP. The raw recipient is passed in but
 * only its redacted forms are emitted.
 */

/** Domain portion of an email, or "unknown" when it can't be parsed. */
export function emailDomain(email: string | null | undefined): string {
  if (!email) return "unknown";
  const at = email.lastIndexOf("@");
  const domain = at >= 0 ? email.slice(at + 1).trim() : "";
  return domain.length > 0 ? domain.toLowerCase() : "unknown";
}

/** Redact an email to `r***@domain` — enough to correlate, never the full address. */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return "none";
  const at = email.lastIndexOf("@");
  if (at <= 0) return "redacted";
  const first = email[0];
  return `${first}***@${emailDomain(email)}`;
}

export type NotificationEvent = "submission" | "tag_status";

export type NotificationLogFields = {
  event: NotificationEvent;
  outcome: NotificationOutcome;
  /** Organization UUID — safe to log. */
  organizationId: string;
  /** Submission reference (SUB-…) or tag-request id — a safe correlation handle. */
  reference?: string | null;
  /** The intended recipient; only its domain + a redacted form are emitted, never the raw address. */
  recipient?: string | null;
  providerId?: string | null;
  providerStatus?: number | null;
  attempts?: number;
  /** Coarse failure class (e.g. "http_500", "timeout", "network", "invalid_from") — never an error body. */
  failureClass?: string | null;
  /**
   * Why a `dry_run` happened: `preview_environment` (the environment rule refused to send) vs
   * `unconfigured` (no provider credentials). Both are healthy; distinguishing them is what tells an
   * operator whether Production is actually wired up. Null for every other outcome.
   */
  reason?: string | null;
};

export function logNotificationEvent(fields: NotificationLogFields): void {
  const payload = {
    tag: "notifications",
    event: fields.event,
    outcome: fields.outcome,
    organizationId: fields.organizationId,
    reference: fields.reference ?? null,
    recipientDomain: emailDomain(fields.recipient),
    recipientRedacted: redactEmail(fields.recipient),
    providerId: fields.providerId ?? null,
    providerStatus: fields.providerStatus ?? null,
    attempts: fields.attempts ?? 0,
    failureClass: fields.failureClass ?? null,
    reason: fields.reason ?? null,
    deploymentContext: deploymentContext(),
  };
  // A genuine failure goes to the error stream; dry-run/skips/sent are informational.
  if (isFailure(fields.outcome)) {
    console.error("[notifications]", JSON.stringify(payload));
  } else {
    console.info("[notifications]", JSON.stringify(payload));
  }
}
