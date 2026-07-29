import "server-only";

import { serverEnv } from "@/lib/env";
import type { EmailContent } from "@/lib/notifications/email";
import { classifyStatus, isRetryable, type NotificationOutcome } from "@/lib/notifications/outcome";

/**
 * Server-only email sender (Resend REST API via fetch — no SDK/dependency). Phase A5:
 *
 *  - DRY-RUN when RESEND_API_KEY or NOTIFICATION_FROM_EMAIL is unset — nothing is sent and NO network
 *    request is made. This is the intended QA mode while Mulemark has no verified sending domain.
 *  - A configured-but-invalid `from` returns `failed_configuration` (a config problem, never a provider
 *    failure) and also makes no request.
 *  - Live sends classify the provider result (sent / failed_permanent / failed_transient), capture the
 *    provider message id, time out via AbortController, and retry transient failures a BOUNDED number of
 *    times (honoring a capped Retry-After).
 *
 * NEVER throws — every failure is caught and returned, so a notification can never break the submission or
 * status-update that triggered it. It does NOT log; the caller (lib/notifications/notify.ts) logs one
 * structured, redacted event with full context.
 */

export const NOTIFICATION_TIMEOUT_MS = 10_000;
export const MAX_ATTEMPTS = 3;
export const MAX_RETRY_WAIT_MS = 2_000;
const BACKOFF_BASE_MS = 250;

export type SendResult = {
  outcome: NotificationOutcome;
  providerId?: string;
  status?: number;
  attempts: number;
  failureClass?: string;
};

export type SendDeps = {
  /** Injectable so tests run instantly; defaults to a real timer sleep. */
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A Resend `from` is either "Name <a@b.co>" or a bare "a@b.co". */
function isValidFrom(from: string): boolean {
  return /<[^@\s]+@[^@\s]+\.[^@\s]+>/.test(from) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from);
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into ms, or null. */
export function parseRetryAfter(headerValue: string | null | undefined, now = Date.now()): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(headerValue);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

/** Bounded backoff for attempt N (1-based): capped exponential, or a capped Retry-After when provided. */
function backoffMs(attempt: number, retryAfterHeader: string | null | undefined): number {
  const retryAfter = parseRetryAfter(retryAfterHeader);
  if (retryAfter !== null) return Math.min(retryAfter, MAX_RETRY_WAIT_MS);
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), MAX_RETRY_WAIT_MS);
}

async function extractProviderId(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { id?: unknown } | null;
    return typeof body?.id === "string" ? body.id : undefined;
  } catch {
    return undefined;
  }
}

export async function sendNotificationEmail(
  to: string,
  content: EmailContent,
  deps: SendDeps = {}
): Promise<SendResult> {
  const apiKey = serverEnv.resendApiKey;
  const from = serverEnv.notificationFromEmail;
  const sleep = deps.sleep ?? realSleep;

  // Unconfigured → explicit dry-run. No network request is made.
  if (!apiKey || !from) {
    return { outcome: "dry_run", attempts: 0 };
  }
  // Configured but the sender identity is malformed → a configuration failure, not a provider failure.
  if (!isValidFrom(from)) {
    return { outcome: "failed_configuration", attempts: 0, failureClass: "invalid_from" };
  }

  const body = JSON.stringify({
    from,
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  let attempts = 0;
  let lastStatus: number | undefined;
  let lastFailureClass: string | undefined;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      // Network error or the timeout abort → transient.
      lastFailureClass = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
      if (attempts < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempts, null));
        continue;
      }
      return { outcome: "failed_transient", attempts, failureClass: lastFailureClass };
    } finally {
      clearTimeout(timer);
    }

    const outcome = classifyStatus(res.status);
    if (outcome === "sent") {
      const providerId = await extractProviderId(res);
      return { outcome, providerId, status: res.status, attempts };
    }
    if (!isRetryable(outcome)) {
      return { outcome, status: res.status, attempts, failureClass: `http_${res.status}` };
    }
    // Transient (429 / 5xx): retry within bounds.
    lastStatus = res.status;
    lastFailureClass = `http_${res.status}`;
    if (attempts < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempts, res.headers.get("retry-after")));
      continue;
    }
    return { outcome: "failed_transient", status: lastStatus, attempts, failureClass: lastFailureClass };
  }

  // Unreachable in practice (the loop returns on the last attempt), but keeps the function total.
  return { outcome: "failed_transient", status: lastStatus, attempts, failureClass: lastFailureClass ?? "unknown" };
}
