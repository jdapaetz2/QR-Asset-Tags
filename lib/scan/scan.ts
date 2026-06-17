import { createHash } from "node:crypto";

/**
 * Pure helpers for scan logging. Privacy: raw IPs are never stored — only a
 * salted, truncated one-way hash (see hashIp). See docs/SECURITY_MODEL.md.
 */

/** Coarse device class derived from the User-Agent. */
export function deviceTypeFromUserAgent(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|windows phone/.test(s)) return "mobile";
  return "desktop";
}

/** First address from an `x-forwarded-for` header, or null. */
export function parseClientIp(
  forwardedFor: string | null | undefined
): string | null {
  if (!forwardedFor) return null;
  const first = forwardedFor.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * Salted, truncated SHA-256 of an IP. Returns null when there is no IP. The salt
 * (SCAN_IP_HASH_SALT) frustrates rainbow-table reversal; the raw IP is discarded.
 */
export function hashIp(ip: string | null, salt: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
