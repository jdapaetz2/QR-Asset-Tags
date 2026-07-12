/**
 * Public submission reference (Prompt B / G.7). The submit action now computes the ONE
 * canonical reference — `submissionReference(id, created_at)` = `SUB-YYYY-XXXXXX`
 * (lib/submissions/inbox.ts) — and passes it to the thanks page as `?ref=`. This helper
 * only VALIDATES that already-canonical value from the URL so the renter sees exactly the
 * same string the rental company sees in the admin list, detail, CSV, and email.
 *
 * It is display-only and reveals nothing (anon can never read submissions back); a
 * missing or non-canonical value returns null so the thanks page simply omits it, which
 * also guards against arbitrary hand-edited `?ref=` input.
 */
const CANONICAL_REFERENCE = /^SUB-\d{4}-[0-9A-F]{6}$/;

export function readSubmissionReference(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== "string") return null;
  return CANONICAL_REFERENCE.test(raw) ? raw : null;
}
