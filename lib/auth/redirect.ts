/**
 * Safe post-login redirect handling. A `next` value comes from user-controlled
 * input (query string / form field), so it must be validated to an internal,
 * same-origin path before we redirect to it — otherwise it is an open-redirect.
 */

/**
 * Returns `value` only if it is a safe internal path (starts with a single `/`),
 * otherwise `null`. Rejects absolute URLs and protocol-relative `//host` forms.
 */
export function sanitizeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.startsWith("/")) return null;
  // Reject protocol-relative ("//evil.com") and backslash tricks ("/\evil.com").
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
