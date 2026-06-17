/**
 * Pure validation for the public damage-report form. No I/O. The server action
 * derives organization_id/asset_id/form_type/status server-side; this only
 * validates the user-supplied contact + description fields.
 *
 * Required fields follow docs/OPEN_QUESTIONS.md #7: name required, description
 * required, at least one of email/phone.
 */

export const URGENCY_LEVELS = ["low", "medium", "high"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

/** Honeypot field name — must stay empty; if filled, the submission is a bot. */
export const HONEYPOT_FIELD = "company_website";

export type DamageReportInput = {
  name: string | null;
  email: string | null;
  phone: string | null;
  urgency: string | null;
  description: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Returns an error message, or null when the input is valid. */
export function validateDamageReport(input: DamageReportInput): string | null {
  const name = clean(input.name);
  const email = clean(input.email);
  const phone = clean(input.phone);
  const description = clean(input.description);
  const urgency = clean(input.urgency);

  if (!name) return "Your name is required.";
  if (!description) return "A description of the damage is required.";
  if (!email && !phone) return "Provide an email or a phone number.";
  if (email && !EMAIL_RE.test(email)) return "Enter a valid email address.";
  if (urgency && !(URGENCY_LEVELS as readonly string[]).includes(urgency)) {
    return "Select a valid urgency level.";
  }
  return null;
}
