import { createHash } from "node:crypto";

/**
 * Phase B4 — deterministic notification idempotency keys.
 *
 * Resend deduplicates POST /emails on an `Idempotency-Key` header: within a 24-hour window a repeated
 * key returns the ORIGINAL response without sending a second message (max 256 characters). That is the
 * mechanism this module feeds.
 *
 * Why it matters: the sender retries transient failures, and the worst case is a TIMEOUT — Resend may
 * have accepted the message we stopped waiting for. Without a key, that retry is a duplicate email to a
 * real customer. With one, the retry is a no-op. The key must therefore be computed ONCE per logical
 * notification and reused across every attempt (see lib/notifications/send.ts).
 *
 * Shape: `mm.<event>.<reference>.<recipientHash>` — a stable, opaque, log-safe string.
 *
 * The recipient is included as a truncated SHA-256, never in the clear, for two independent reasons:
 *  - CORRECTNESS: Resend dedupes on the key alone, so if an org changed its notification address and an
 *    event replayed inside the window, a recipient-free key would silently swallow the message to the
 *    NEW address. Binding the recipient makes a genuinely different email a genuinely different key.
 *  - PRIVACY: the key travels in a request header and may surface in provider dashboards and our own
 *    logs, which are held to "never the full address" (lib/notifications/log.ts).
 *
 * Pure: no I/O, no env, no secrets.
 */

/** Resend's documented maximum for the Idempotency-Key header. */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

/** Characters kept from the recipient digest — 8 hex chars (32 bits) is ample to separate recipients. */
const RECIPIENT_HASH_LENGTH = 8;

export type IdempotencyEvent = "submission" | "tag_status";

export type IdempotencyInput = {
  event: IdempotencyEvent;
  /**
   * The canonical record this notification is *about*, and any part of its state that legitimately
   * warrants a second email. A submission notifies exactly once, so its id alone is enough. A tag
   * request notifies on every status change, so the reference must carry the status — `requested →
   * delivered` must send, a replay of `delivered` must not.
   */
  reference: string;
  recipient: string;
};

/** Keep the key to characters that are unambiguous in a header and in a log line. */
function sanitizeReference(reference: string): string {
  const cleaned = reference.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-");
  return cleaned.length > 0 ? cleaned : "unknown";
}

function recipientDigest(recipient: string): string {
  return createHash("sha256")
    .update(recipient.trim().toLowerCase())
    .digest("hex")
    .slice(0, RECIPIENT_HASH_LENGTH);
}

/**
 * Build the provider idempotency key for one logical notification. Deterministic: the same event,
 * reference and recipient always produce the same key, which is exactly what makes a replay safe.
 */
export function notificationIdempotencyKey(input: IdempotencyInput): string {
  const key = `mm.${input.event}.${sanitizeReference(input.reference)}.${recipientDigest(input.recipient)}`;
  // References are ids and short status strings, so this never truncates in practice; the slice is a
  // guarantee against a future caller passing something long, not an expected path.
  return key.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH);
}
