/**
 * Pure CAD money helpers for the owner plan forms. Prices are stored in the DB as
 * integer cents (`*_cents` columns) for precision, but the owner enters and sees
 * whole CAD dollars. These convert between the two. No I/O. Commercial metadata only
 * — not billing/Stripe.
 */

/**
 * Parse an owner-entered CAD dollar amount into integer cents.
 * - blank / non-string → `null` (clears the field)
 * - accepts `4500`, `4,500`, `$4,500`, `4500.00` (up to 2 decimals)
 * - rejects negatives, text, and >2 decimals → `undefined` (invalid)
 *
 * Uses string math so there is no floating-point drift (`4500.10` → `450010`).
 */
export function parseCadInputToCents(
  value: string | undefined
): number | null | undefined {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;

  const [whole, frac = ""] = cleaned.split(".");
  const fracCents = Number((frac + "00").slice(0, 2));
  return Number(whole) * 100 + fracCents;
}

/**
 * Format integer cents as a plain CAD dollar string for a text input value.
 * `null`/`undefined` → `""`; whole dollars → `"4500"`; otherwise 2 decimals `"750.50"`.
 */
export function formatCentsAsCadInput(
  cents: number | null | undefined
): string {
  if (cents == null) return "";
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}
