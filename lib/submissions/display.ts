/**
 * Pure display helpers for the admin submission inbox. No I/O. Renders the
 * form-specific `submission_data_json` as labeled fields so admins never see raw
 * JSON as the only display, with a humanized fallback for unknown keys.
 *
 * Engineering Phase D2: renter triage answers are labelled "Reported …" and shown with human value labels. They
 * appear only on rows whose form asked them (`triage_version: 1`), where an omitted answer reads "Not reported".
 * A pre-D2 damage report shows its legacy value as "Reported urgency" — never as severity.
 */

import {
  DAMAGE_SEVERITY_LABELS,
  EQUIPMENT_STATE_LABELS,
  ISSUE_TYPE_LABELS,
  LEGACY_URGENCY_LABELS,
  RESPONSE_NEED_LABELS,
  TRIAGE_FIELDS,
  TRIAGE_VERSION,
  TRIAGE_VERSION_FIELD,
} from "@/lib/submissions/triage";

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
  [TRIAGE_FIELDS.issueType]: "Reported issue type",
  [TRIAGE_FIELDS.equipmentState]: "Reported equipment state",
  [TRIAGE_FIELDS.responseNeed]: "Reported response need",
  [TRIAGE_FIELDS.damageSeverity]: "Reported damage severity",
  urgency: "Reported urgency",
  description: "Description",
  preferred_contact_method: "Preferred contact",
  condition_notes: "Condition notes",
  fuel_or_charge_level: "Fuel / charge level",
  cleaned: "Cleaned",
  accessories_returned: "Accessories returned",
  damage_observed: "Damage observed",
};

/** Human labels for enumerated stored values. */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  [TRIAGE_FIELDS.issueType]: ISSUE_TYPE_LABELS,
  [TRIAGE_FIELDS.equipmentState]: EQUIPMENT_STATE_LABELS,
  [TRIAGE_FIELDS.responseNeed]: RESPONSE_NEED_LABELS,
  [TRIAGE_FIELDS.damageSeverity]: DAMAGE_SEVERITY_LABELS,
  urgency: LEGACY_URGENCY_LABELS,
};

const TRIAGE_KEYS: ReadonlySet<string> = new Set(Object.values(TRIAGE_FIELDS));

/** Stored bookkeeping that is never shown as a field. */
const HIDDEN_KEYS: readonly string[] = [TRIAGE_VERSION_FIELD];

// Ordered keys per known form type so fields render in a predictable, readable order.
const FIELD_ORDER: Record<string, string[]> = {
  damage_report: [
    TRIAGE_FIELDS.equipmentState,
    TRIAGE_FIELDS.responseNeed,
    TRIAGE_FIELDS.damageSeverity,
    "urgency",
    "description",
  ],
  support_request: [
    TRIAGE_FIELDS.issueType,
    TRIAGE_FIELDS.responseNeed,
    "preferred_contact_method",
    "description",
  ],
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

function formatValue(key: string, value: unknown): string {
  const empty = value === null || value === undefined || value === "";
  if (TRIAGE_KEYS.has(key) && empty) return "Not reported";
  if (empty) return "—";
  if (typeof value === "string") return VALUE_LABELS[key]?.[value] ?? value;
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
  const triageRecorded = obj[TRIAGE_VERSION_FIELD] === TRIAGE_VERSION;
  const order = FIELD_ORDER[formType] ?? [];
  const seen = new Set<string>(HIDDEN_KEYS);
  const fields: SubmissionField[] = [];

  for (const key of order) {
    seen.add(key);
    // Triage answers only exist where the form asked them; legacy urgency only where it was stored.
    if (TRIAGE_KEYS.has(key) && !triageRecorded) continue;
    if (key === "urgency" && !Object.prototype.hasOwnProperty.call(obj, key)) continue;
    fields.push({ label: FIELD_LABELS[key] ?? humanize(key), value: formatValue(key, obj[key]) });
  }
  // Fallback: include any keys not in the known order so nothing is hidden.
  for (const key of Object.keys(obj)) {
    if (seen.has(key)) continue;
    if (TRIAGE_KEYS.has(key) && !triageRecorded) continue;
    fields.push({ label: FIELD_LABELS[key] ?? humanize(key), value: formatValue(key, obj[key]) });
  }
  return fields;
}
