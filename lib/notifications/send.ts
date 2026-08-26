import "server-only";

import { deploymentContext, serverEnv } from "@/lib/env";
import type { EmailContent } from "@/lib/notifications/email";
import { classifyStatus, isRetryable, type NotificationOutcome } from "@/lib/notifications/outcome";

/**
 * Server-only email sender (Resend REST API via fetch — no SDK/dependency).
 *
 * Phase A5 established the outcome model:
 *  - DRY-RUN when RESEND_API_KEY or NOTIFICATION_FROM_EMAIL is unset — nothing is sent and NO network
 *    request is made.
 *  - A configured-but-invalid `from` returns `failed_configuration` (a config problem, never a provider
 *    failure) and also makes no request.
 *  - Live sends classify the provider result (sent / failed_permanent / failed_transient), capture the
 *    provider message id, time out via AbortController, and retry transient failures a BOUNDED number of
 *    times (honoring a capped Retry-After).
 *
 * Phase B4 adds the three things a LIVE sender needs that a dry-run one did not:
 *
 *  1. PREVIEW CAN NEVER SEND. Preview/staging returns `dry_run` before any env var is read, so live mail
 *     is impossible there even if a key were added to the Vercel Preview environment by mistake. Absent
 *     credentials were the only safeguard before; that is a configuration promise, not a guarantee.
 *  2. IDEMPOTENCY. The caller's key goes out as `Idempotency-Key` on EVERY attempt, so the retry loop
 *     cannot duplicate a real customer email — the dangerous case being a timeout on a request the
 *     provider actually accepted. Reusing one key across attempts is the whole point.
 *  3. A TOTAL TIME BUDGET. Notifications are awaited inside the submission request, so per-attempt
 *     timeouts alone are not enough: three 10 s attempts plus backoff could hold a renter's form POST
 *     for ~31 s and risk the platform's function limit. The budget bounds the WHOLE call.
 *
 * NEVER throws — every failure is caught and returned, so a notification can never break the submission
 * or status-update that triggered it. It does NOT log; the caller (lib/notifications/notify.ts) logs one
 * structured, redacted event with full context.
 */

export const NOTIFICATION_TIMEOUT_MS = 8_000;
export const MAX_ATTEMPTS = 3;
export const MAX_RETRY_WAIT_MS = 2_000;
/**
 * Wall-clock ceiling for a whole send, retries and backoff included. Chosen to stay comfortably inside
 * a serverless function limit while leaving room for the submission insert that precedes it.
 */
export const NOTIFICATION_TOTAL_BUDGET_MS = 15_000;
const BACKOFF_BASE_MS = 250;

/** Why a send resolved to `dry_run` — distinguishes an enforced environment rule from missing config. */
export type DryRunReason = "preview_environment" | "unconfigured";

export type SendResult = {
  outcome: NotificationOutcome;
  providerId?: string;
  status?: number;
  attempts: number;
  failureClass?: string;
  reason?: DryRunReason;
};

export type SendOptions = {
  /**
   * Provider idempotency key for this logical notification (lib/notifications/idempotency.ts). Sent on
   * every attempt. Omitted only by callers that genuinely have no canonical record to key on.
   */
  idempotencyKey?: string;
  /** Reply-To address; omitted from the request entirely when absent. */
  replyTo?: string;
};

export type SendDeps = {
  /** Injectable so tests run instantly; defaults to a real timer sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock so the total-budget logic is deterministic in tests. */
  now?: () => number;
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
  deps: SendDeps = {},
  options: SendOptions = {}
): Promise<SendResult> {
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;

  // Environment rule, enforced BEFORE any credential is read: preview/staging never sends live mail.
  // This is deliberately not conditional on configuration — see the module comment.
  if (deploymentContext() === "preview") {
    return { outcome: "dry_run", attempts: 0, reason: "preview_environment" };
  }

  const apiKey = serverEnv.resendApiKey;
  const from = serverEnv.notificationFromEmail;

  // Unconfigured → explicit dry-run. No network request is made.
  if (!apiKey || !from) {
    return { outcome: "dry_run", attempts: 0, reason: "unconfigured" };
  }
  // Configured but the sender identity is malformed → a configuration failure, not a provider failure.
  if (!isValidFrom(from)) {
    return { outcome: "failed_configuration", attempts: 0, failureClass: "invalid_from" };
  }

  const replyTo = options.replyTo?.trim();
  const body = JSON.stringify({
    from,
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    // Omitted entirely when unset — Resend treats a present-but-empty reply_to as a malformed address.
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const startedAt = now();
  const remainingBudget = () => NOTIFICATION_TOTAL_BUDGET_MS - (now() - startedAt);

  let attempts = 0;
  let lastStatus: number | undefined;
  let lastFailureClass: string | undefined;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    // Never let one attempt outlive the budget; the abort is what keeps the caller's request bounded.
    const attemptTimeout = Math.min(NOTIFICATION_TIMEOUT_MS, Math.max(0, remainingBudget()));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeout);
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      // Network error or the timeout abort → transient. The idempotency key makes the retry safe even
      // when the provider accepted the request we abandoned.
      lastFailureClass = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
      const wait = backoffMs(attempts, null);
      if (attempts < MAX_ATTEMPTS && wait < remainingBudget()) {
        await sleep(wait);
        continue;
      }
      return {
        outcome: "failed_transient",
        attempts,
        failureClass: attempts < MAX_ATTEMPTS ? "budget_exhausted" : lastFailureClass,
      };
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
    // Transient (429 / 5xx): retry within both bounds — attempt count AND remaining wall clock.
    lastStatus = res.status;
    lastFailureClass = `http_${res.status}`;
    const wait = backoffMs(attempts, res.headers.get("retry-after"));
    if (attempts < MAX_ATTEMPTS && wait < remainingBudget()) {
      await sleep(wait);
      continue;
    }
    return {
      outcome: "failed_transient",
      status: lastStatus,
      attempts,
      failureClass: attempts < MAX_ATTEMPTS ? "budget_exhausted" : lastFailureClass,
    };
  }

  // Unreachable in practice (the loop returns on the last attempt), but keeps the function total.
  return { outcome: "failed_transient", status: lastStatus, attempts, failureClass: lastFailureClass ?? "unknown" };
}
