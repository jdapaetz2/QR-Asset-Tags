/**
 * Public submission reference formatting (Prompt B). A submission's raw id (a UUID) is threaded
 * to the thanks page only for display — anon can never read submissions back (RLS), so this
 * exposes nothing. We show a short, human-quotable reference derived from that id.
 *
 * `SUB-XXXXXX` = the last 6 hex characters of the id, uppercased. Deterministic and pure; a
 * missing/invalid id returns null so the thanks page simply omits the reference.
 */
export function formatSubmissionReference(
  rawId: string | null | undefined
): string | null {
  if (typeof rawId !== "string") return null;
  const hex = rawId.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length < 6) return null;
  return `SUB-${hex.slice(-6).toUpperCase()}`;
}
