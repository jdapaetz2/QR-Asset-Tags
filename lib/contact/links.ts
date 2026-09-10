/**
 * Conservative contact-link builders (Engineering Phase D1). Pure — no I/O — and client-safe, so the notification
 * email (D1) and the public confirmation page (D2) share one rule.
 *
 * A link is produced ONLY when the stored value survives strict normalization. Anything else returns null and the
 * caller shows the value as escaped plain text with no link. A malformed or hostile value — letters in a phone
 * number, a `?cc=` smuggled into an address — therefore never becomes a working `tel:` or `mailto:` URI.
 */

/** A trailing extension ("ext 12", "x12", "#12") is dropped from the dialled number but kept in visible text. */
const EXTENSION_SUFFIX = /\s*(?:ext\.?|extension|x|#)\s*\d{1,6}\s*$/i;
/** After the extension is removed, only digits, one leading "+", spaces, dots, dashes and parentheses may remain. */
const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;
export const MIN_PHONE_DIGITS = 7;
export const MAX_PHONE_DIGITS = 15;

export function telHref(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const dialled = raw.trim().replace(EXTENSION_SUFFIX, "");
  if (!PHONE_CHARACTERS.test(dialled)) return null;
  const digits = dialled.replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return null;
  return `tel:${dialled.startsWith("+") ? "+" : ""}${digits}`;
}

/**
 * Deliberately stricter than the intake check in `lib/forms/validate.ts`: no "%" (percent-encoding), no "?" or "&"
 * (extra mailto headers), no quotes, spaces or angle brackets. A saved address that fails is shown, not linked.
 */
const LINKABLE_EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const MAX_EMAIL_LENGTH = 254;

export function mailtoHref(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const address = raw.trim();
  if (address.length === 0 || address.length > MAX_EMAIL_LENGTH) return null;
  return LINKABLE_EMAIL.test(address) ? `mailto:${address}` : null;
}
