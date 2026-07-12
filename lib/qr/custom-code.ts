/**
 * Validation + normalization for OWNER-supplied custom QR short codes. Pure (no I/O) so it is
 * easy to test; global uniqueness is enforced by the DB (`qr_links.short_code` unique) — this only
 * guards format + reserved words. Auto-generated codes (`short-code.ts`) never pass through here.
 *
 * A short code only ever resolves under `/t/{code}`, so it cannot shadow an app route; the reserved
 * list is defense-in-depth + future-proofing, and keeps codes readable/typeable.
 */

export const CUSTOM_CODE_MIN = 4;
export const CUSTOM_CODE_MAX = 48;

/**
 * Codes that must never be used — the product's real route roots plus a few operational names.
 * (Codes live under `/t/`, so this is belt-and-suspenders, not a live collision surface.)
 */
export const RESERVED_SHORT_CODES = new Set<string>([
  "t",
  "forms",
  "dashboard",
  "owner",
  "login",
  "auth",
  "suspended",
  "api",
  "admin",
  "settings",
  "assets",
  "support",
  "damage",
  "return",
  "new",
  "thanks",
  "favicon.ico",
  "icon.svg",
  "robots.txt",
  "sitemap.xml",
]);

// Lowercase, url-safe: one or more [a-z0-9] groups joined by single hyphens. This rejects a
// leading/trailing hyphen and any consecutive hyphens in a single pass.
const CUSTOM_CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Trim surrounding whitespace and lowercase — the canonical form we store + validate. */
export function normalizeCustomShortCode(input: string): string {
  return input.trim().toLowerCase();
}

export type CustomCodeResult = { code: string } | { error: string };

/**
 * Validate an owner-typed custom short code. Returns the normalized `{ code }` or an `{ error }`
 * with a specific, fixable message. Does NOT check uniqueness (DB does that).
 */
export function validateCustomShortCode(input: string): CustomCodeResult {
  const code = normalizeCustomShortCode(input);

  if (code.length === 0) return { error: "Enter a short code." };
  if (code.length < CUSTOM_CODE_MIN) {
    return { error: `Short code must be at least ${CUSTOM_CODE_MIN} characters.` };
  }
  if (code.length > CUSTOM_CODE_MAX) {
    return { error: `Short code must be ${CUSTOM_CODE_MAX} characters or fewer.` };
  }
  if (!CUSTOM_CODE_RE.test(code)) {
    return {
      error:
        "Use lowercase letters, numbers, and single hyphens only (no leading, trailing, or double hyphens).",
    };
  }
  if (RESERVED_SHORT_CODES.has(code)) {
    return { error: "That short code is reserved. Choose another." };
  }

  return { code };
}
