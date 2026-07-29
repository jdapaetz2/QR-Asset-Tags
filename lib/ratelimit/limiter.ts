import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { serverEnv } from "@/lib/env";
import { hashIp, parseClientIp } from "@/lib/scan/scan";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBucketKey, selectRules, type RateLimitAction } from "@/lib/ratelimit/policy";
import { logAbuseEvent } from "@/lib/ratelimit/log";

/**
 * Phase A4 — the shared-store rate limiter for public intake. Runs as SERVICE-ROLE (trusted server
 * code) so the counter table + `rate_limit_touch` RPC are unreachable by anon/authenticated. The RPC is
 * atomic and shared across all Vercel instances (Postgres), so this is production-safe where process
 * memory would not be.
 *
 * PRIVACY: only a salted hash of the client IP and short code ever leaves this module; the raw IP is
 * discarded. FAIL-OPEN: if there is no client IP (local dev; Vercel always sets x-forwarded-for) or the
 * limiter infra errors, the request is ALLOWED — a limiter hiccup must never block a real renter.
 */

export type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
  /** Salted hash of the short code, for structured logs (never the raw short code). */
  shortCodeHash: string;
};

/** Salted, truncated SHA-256 of an arbitrary token (mirrors hashIp; used for the short code). */
export function hashToken(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}

export async function checkRateLimit(input: {
  action: RateLimitAction;
  shortCode: string;
  hasMedia: boolean;
  correlationId: string;
}): Promise<RateLimitResult> {
  const salt = serverEnv.scanIpHashSalt;
  const shortCodeHash = hashToken(input.shortCode, salt);

  let ipHash: string | null = null;
  try {
    const h = await headers();
    ipHash = hashIp(parseClientIp(h.get("x-forwarded-for")), salt);
  } catch {
    ipHash = null;
  }

  // No client IP → cannot key by user; allow (production always has x-forwarded-for). Not an abuse signal.
  if (!ipHash) {
    return { allowed: true, retryAfter: 0, shortCodeHash };
  }

  const key = buildBucketKey(input.action, ipHash, shortCodeHash);
  const rules = selectRules(input.action, input.hasMedia);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_touch", { p_key: key, p_rules: rules });
    if (error || !data) {
      // Fail-open on limiter infra error, but record it.
      logAbuseEvent({
        action: input.action,
        correlationId: input.correlationId,
        shortCodeHash,
        limiter: "failopen",
        failure: "limiter",
      });
      return { allowed: true, retryAfter: 0, shortCodeHash };
    }
    const result = data as { allowed: boolean; retry_after: number };
    return {
      allowed: result.allowed,
      retryAfter: result.retry_after ?? 0,
      shortCodeHash,
    };
  } catch {
    logAbuseEvent({
      action: input.action,
      correlationId: input.correlationId,
      shortCodeHash,
      limiter: "failopen",
      failure: "limiter",
    });
    return { allowed: true, retryAfter: 0, shortCodeHash };
  }
}
