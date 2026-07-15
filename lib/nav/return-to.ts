/**
 * One shared, validated `returnTo` helper for preserving operator list context
 * across list → detail → action navigation (Wave 3N.2).
 *
 * A `returnTo` value always originates in user-controllable input (query string /
 * form field), so it must be validated before we ever navigate to it — otherwise
 * it is an open-redirect. We accept ONLY internal dashboard paths (`/dashboard`,
 * `/dashboard/…`, `/dashboard?…`, `/dashboard#…`) and reject everything else:
 * absolute URLs, protocol-relative `//host`, backslash tricks `/\host`, and any
 * in-app path outside `/dashboard` (e.g. `/owner`, `/login`).
 */

/**
 * Returns `value` only if it is a safe internal dashboard path, otherwise `null`.
 * This is the single gate every back-link / post-mutation redirect passes through.
 */
export function sanitizeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.startsWith("/")) return null;
  // Reject protocol-relative ("//evil.com") and backslash tricks ("/\evil.com").
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // Confine to the dashboard area. The char after "/dashboard" must end the segment
  // so "/dashboardXYZ" or "/dashboard-evil" cannot slip through.
  if (value === "/dashboard") return value;
  const next = value.charAt("/dashboard".length);
  if (value.startsWith("/dashboard") && (next === "/" || next === "?" || next === "#")) {
    return value;
  }
  return null;
}

/** The safe destination for a Back link: the validated `returnTo`, else `fallback`. */
export function backHref(returnTo: unknown, fallback: string): string {
  return sanitizeReturnTo(returnTo) ?? fallback;
}

/**
 * Append `?returnTo=<encoded>` (or `&returnTo=…`) to `href`, but only when `returnTo`
 * is a valid dashboard path. Invalid/absent values leave `href` untouched.
 */
export function withReturnTo(href: string, returnTo: unknown): string {
  const safe = sanitizeReturnTo(returnTo);
  if (!safe) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}returnTo=${encodeURIComponent(safe)}`;
}

/**
 * Build the origin URL a list passes forward as its `returnTo` — the current path
 * plus its current query string. `searchParams` accepts the Next.js server
 * searchParams shape (values may be arrays); only the first value of each key is used.
 */
export function currentListHref(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const usp = new URLSearchParams();
  for (const [key, raw] of Object.entries(searchParams)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.length > 0) usp.set(key, value);
  }
  const qs = usp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
