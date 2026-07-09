/**
 * Timestamp formatting (A2). Relative display with an absolute local time available on hover.
 * Uses only the built-in `Intl` APIs — no date-library dependency. Single local/org-level
 * timezone assumption for now. Never render raw UTC on customer-facing screens; use these.
 */

const PLACEHOLDER = "—";

/** Parse a value to a valid Date, or null. */
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Relative time in the product's compact voice: "just now", "5 min ago", "2h ago", "7d ago"
 * (and "in 3h" for the future). Computed with plain arithmetic so the compact units are exact
 * and deterministic — `Intl.RelativeTimeFormat` only emits localized words ("2 hours ago",
 * "yesterday"), which don't match this format. Beyond ~30 days it falls back to an absolute date
 * (relative months read as vague for records). Invalid/missing → "—". `now` is injectable for tests.
 */
export function formatRelative(
  value: string | number | Date | null | undefined,
  now: number = Date.now()
): string {
  const d = toDate(value);
  if (!d) return PLACEHOLDER;

  const diffMs = d.getTime() - now; // negative = past
  const absSec = Math.abs(diffMs) / 1000;
  if (absSec < 45) return "just now";

  const past = diffMs <= 0;
  const wrap = (body: string) => (past ? `${body} ago` : `in ${body}`);

  const MIN = 60;
  const HOUR = 3600;
  const DAY = 86400;

  if (absSec < HOUR) return wrap(`${Math.round(absSec / MIN)} min`);
  if (absSec < DAY) return wrap(`${Math.round(absSec / HOUR)}h`);
  if (absSec < DAY * 30) return wrap(`${Math.round(absSec / DAY)}d`);

  // Older than a month → an absolute date is clearer than "2 months ago".
  return formatAbsolute(d, { dateStyle: "medium" });
}

/**
 * Absolute local timestamp, e.g. "Jul 9, 2026, 3:42 PM". `timeZone` is injectable for
 * deterministic tests (defaults to the runtime local zone). Invalid/missing → "—".
 */
export function formatAbsolute(
  value: string | number | Date | null | undefined,
  options?: { timeZone?: string; dateStyle?: "medium"; withTime?: boolean }
): string {
  const d = toDate(value);
  if (!d) return PLACEHOLDER;

  const dateOnly = options?.dateStyle === "medium" && options.withTime !== true;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    ...(dateOnly ? {} : { timeStyle: "short" }),
    timeZone: options?.timeZone,
  }).format(d);
}
