/**
 * Pure organization-slug helpers. A slug is the URL-safe organization identifier
 * (unique in the DB). No I/O — uniqueness is enforced by the `organizations.slug`
 * unique constraint; the create action turns a violation into a friendly message.
 */

/** Max stored slug length (keeps URLs tidy; DB column is unconstrained text). */
export const MAX_SLUG_LENGTH = 48;

/**
 * Derive a URL-safe slug from a display name: lowercase, ASCII alphanumerics with
 * single hyphens between words, no leading/trailing hyphens, capped length.
 * `"Test Valley Rentals!"` → `"test-valley-rentals"`. NFKD decomposition lets
 * accented letters keep their base form ("Café" → "cafe"); any remaining non-alnum
 * (including combining marks) collapses into a single hyphen.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alnum runs → single hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, ""); // re-trim if the slice landed on a hyphen
}

/** A valid slug is lowercase alphanumerics joined by single hyphens. */
export function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= MAX_SLUG_LENGTH;
}
