/**
 * Pure display helpers for the admin submission inbox. No I/O. Renders the
 * form-specific `submission_data_json` as labeled fields so admins never see raw
 * JSON as the only display, with a humanized fallback for unknown keys.
 */

export const SUBMISSION_STATUSES = [
  "new",
  "reviewed",
  "resolved",
  "archived",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return (
    typeof value === "string" &&
    (SUBMISSION_STATUSES as readonly string[]).includes(value)
  );
}

export const FORM_TYPE_LABELS: Record<string, string> = {
  damage_report: "Damage report",
  support_request: "Support request",
  return_checklist: "Return checklist",
  pre_use_inspection: "Pre-use inspection",
};

export function formTypeLabel(formType: string): string {
  return FORM_TYPE_LABELS[formType] ?? humanize(formType);
}

const FIELD_LABELS: Record<string, string> = {
  urgency: "Urgency",
  description: "Description",
  preferred_contact_method: "Preferred contact",
  condition_notes: "Condition notes",
  fuel_or_charge_level: "Fuel / charge level",
  cleaned: "Cleaned",
  accessories_returned: "Accessories returned",
  damage_observed: "Damage observed",
};

// Ordered keys per known form type so fields render in a predictable, readable order.
const FIELD_ORDER: Record<string, string[]> = {
  damage_report: ["urgency", "description"],
  support_request: ["preferred_contact_method", "description"],
  return_checklist: [
    "condition_notes",
    "fuel_or_charge_level",
    "cleaned",
    "accessories_returned",
    "damage_observed",
  ],
};

function humanize(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export type SubmissionField = { label: string; value: string };

/** Ordered, labeled fields for a submission's `submission_data_json`. */
export function submissionFields(
  formType: string,
  data: unknown
): SubmissionField[] {
  const obj =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const order = FIELD_ORDER[formType] ?? [];
  const seen = new Set<string>();
  const fields: SubmissionField[] = [];

  for (const key of order) {
    seen.add(key);
    fields.push({ label: FIELD_LABELS[key] ?? humanize(key), value: formatValue(obj[key]) });
  }
  // Fallback: include any keys not in the known order so nothing is hidden.
  for (const key of Object.keys(obj)) {
    if (seen.has(key)) continue;
    fields.push({ label: FIELD_LABELS[key] ?? humanize(key), value: formatValue(obj[key]) });
  }
  return fields;
}
