import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deviceTypeFromUserAgent, hashIp, parseClientIp } from "@/lib/scan/scan";

/**
 * Best-effort scan logging for a public page view.
 *
 * SPLIT IN TWO IN PHASE C5, and the split is the point rather than a detail of it. The insert now runs
 * AFTER the response via `next/server`'s `after()` (see `lib/scan/schedule.ts`), and the installed
 * Next.js documentation is explicit that a Server Component **cannot** call `headers()` or `cookies()`
 * inside an `after` callback — request data must be read during render and passed in. This module used
 * to call `await headers()` itself, so deferring it unchanged would have been exactly that misuse.
 *
 * `next/headers` is therefore no longer imported here at all, and a test asserts it stays that way.
 *
 * PRIVACY IS UNCHANGED IN WHAT IS STORED AND STRICTER IN WHAT IS HELD. The IP is hashed while the
 * request is still being rendered, so only the salted 32-character digest is captured by the deferred
 * callback — the raw address never survives into work that outlives the response. Same salt, same
 * `hashIp`, same columns. See docs/SECURITY_MODEL.md.
 */

export type ScanTarget = {
  qrLinkId: string;
  assetId: string;
  organizationId: string;
};

/**
 * Everything the deferred insert needs, and nothing else: plain, privacy-safe primitives that are
 * already detached from the request. There is deliberately no field through which a raw IP, a header
 * object or a request handle could be carried into the callback.
 */
export type ScanRequestMeta = {
  userAgent: string | null;
  referrer: string | null;
  /** Salted, truncated hash — never a raw address. */
  ipHash: string | null;
  deviceType: string;
};

/** The narrow slice of `Headers` this needs. Structural, so `ReadonlyHeaders` and a stub both fit. */
type HeaderReader = { get(name: string): string | null };

/**
 * Read the request-scoped values the scan row needs. **Must be called during render**, never inside an
 * `after` callback.
 *
 * The salt is a parameter rather than an ambient read, matching the existing `hashIp(ip, salt)` idiom
 * and making this function pure and directly testable.
 */
export function readScanRequestMeta(h: HeaderReader, salt: string): ScanRequestMeta {
  const userAgent = h.get("user-agent");
  const ip = parseClientIp(h.get("x-forwarded-for"));
  return {
    userAgent,
    referrer: h.get("referer"),
    // Hashed here, at read time. The raw IP goes out of scope with this function.
    ipHash: hashIp(ip, salt),
    deviceType: deviceTypeFromUserAgent(userAgent),
  };
}

/**
 * Insert one `scan_events` row as the anon role. RLS (`scan_events_public_insert`) independently
 * restricts this to a matching **active** QR link, so eligibility is enforced by Postgres regardless of
 * what the caller believes.
 *
 * Any failure is swallowed: this is best-effort logging by existing product policy, and C5 changes only
 * *when* it runs, never whether it may fail.
 */
export async function recordScan(
  client: SupabaseClient,
  target: ScanTarget,
  meta: ScanRequestMeta
): Promise<void> {
  try {
    await client.from("scan_events").insert({
      qr_link_id: target.qrLinkId,
      asset_id: target.assetId,
      organization_id: target.organizationId,
      user_agent: meta.userAgent,
      ip_hash: meta.ipHash,
      referrer: meta.referrer,
      device_type: meta.deviceType,
    });
  } catch {
    // Intentionally ignored — a scan-log failure must not break the page.
  }
}
