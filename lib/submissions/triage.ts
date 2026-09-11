/**
 * Engineering Phase D2 — the vocabulary for REPORTED triage answers on public damage and support forms. Pure and
 * client-safe (no I/O, no server-only import) so the public forms, the admin UI and the notification projection all
 * read one contract.
 *
 * Stored top-level in `submission_data_json`, alongside `triage_version: 1`:
 *   - `reported_equipment_state`  damage reports
 *   - `reported_response_need`    damage reports and support requests
 *   - `reported_damage_severity`  damage reports (displayed only — it never raises notification priority)
 *   - `reported_issue_type`       support requests
 *
 * Every answer is optional and nothing is pre-selected: an omitted answer is stored as `null` ("Not reported"), and
 * `not_sure` is a real answer that behaves exactly like an omitted one for priority. Every value is the SUBMITTER's
 * selection and is always presented as "Reported …" — never as a verified mechanical, damage, recovery or safety
 * determination.
 *
 * `triage_version: 1` distinguishes a report whose submitter skipped every question from a report written before
 * these questions existed. Until a row carries it, `readTriage` returns null and nothing pretends the questions
 * were asked. (D1 sketched different key names; no row was ever written with them, so they were replaced here.)
 */
import { URGENCY_LEVELS, type Urgency } from "@/lib/forms/validate";

export const TRIAGE_VERSION = 1;

/** The stored key, and the hidden field the D2 forms post, marking the triage contract version. */
export const TRIAGE_VERSION_FIELD = "triage_version";

export const TRIAGE_FIELDS = {
  issueType: "reported_issue_type",
  equipmentState: "reported_equipment_state",
  responseNeed: "reported_response_need",
  damageSeverity: "reported_damage_severity",
} as const;

export const EQUIPMENT_STATES = [
  "operating",
  "operating_with_limitations",
  "not_operating",
  "cannot_be_moved",
  "unsafe_to_operate",
  "not_sure",
] as const;
export type EquipmentState = (typeof EQUIPMENT_STATES)[number];

export const RESPONSE_NEEDS = ["routine", "prompt", "immediate", "not_sure"] as const;
export type ResponseNeed = (typeof RESPONSE_NEEDS)[number];

export const DAMAGE_SEVERITIES = ["minor", "moderate", "major", "not_sure"] as const;
export type DamageSeverity = (typeof DAMAGE_SEVERITIES)[number];

export const ISSUE_TYPES = [
  "operating_question",
  "breakdown_no_start",
  "stuck_recovery",
  "rollover_safety",
  "other",
  "not_sure",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

// ---------------------------------------------------------------------------
// Admin and email labels — rendered after "Reported equipment state:" and friends.
// ---------------------------------------------------------------------------

export const EQUIPMENT_STATE_LABELS: Record<EquipmentState, string> = {
  operating: "Operating",
  operating_with_limitations: "Operating with limitations",
  not_operating: "Not operating",
  cannot_be_moved: "Cannot be moved",
  unsafe_to_operate: "Unsafe to operate",
  not_sure: "Not sure",
};

export const RESPONSE_NEED_LABELS: Record<ResponseNeed, string> = {
  routine: "No immediate response needed",
  prompt: "Follow up soon",
  immediate: "Help needed now",
  not_sure: "Not sure",
};

export const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
  not_sure: "Not sure",
};

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  operating_question: "Operating question",
  breakdown_no_start: "Breakdown or no-start",
  stuck_recovery: "Stuck or needs recovery",
  rollover_safety: "Rollover or safety incident",
  other: "Other",
  not_sure: "Not sure",
};

// ---------------------------------------------------------------------------
// Renter-facing answer choices, in the order the public forms show them.
// ---------------------------------------------------------------------------

export type TriageOption<T extends string = string> = { value: T; label: string };

export const EQUIPMENT_STATE_OPTIONS: readonly TriageOption<EquipmentState>[] = [
  { value: "operating", label: "Yes, it works normally" },
  { value: "operating_with_limitations", label: "Yes, but not properly" },
  { value: "not_operating", label: "No, it won't run or work" },
  { value: "cannot_be_moved", label: "It's stuck or can't be moved" },
  { value: "unsafe_to_operate", label: "It's not safe to use" },
  { value: "not_sure", label: "Not sure" },
];

export const RESPONSE_NEED_OPTIONS: readonly TriageOption<ResponseNeed>[] = [
  { value: "routine", label: "No rush" },
  { value: "prompt", label: "Please follow up soon" },
  { value: "immediate", label: "I need help now" },
  { value: "not_sure", label: "Not sure" },
];

export const DAMAGE_SEVERITY_OPTIONS: readonly TriageOption<DamageSeverity>[] = [
  { value: "minor", label: "Minor — scratches or dents" },
  { value: "moderate", label: "Moderate — something bent or broken" },
  { value: "major", label: "Major — serious damage" },
  { value: "not_sure", label: "Not sure" },
];

export const ISSUE_TYPE_OPTIONS: readonly TriageOption<IssueType>[] = [
  { value: "operating_question", label: "How to use it" },
  { value: "breakdown_no_start", label: "It broke down or won't start" },
  { value: "stuck_recovery", label: "It's stuck or needs recovery" },
  { value: "rollover_safety", label: "Rollover or safety issue" },
  { value: "other", label: "Something else" },
  { value: "not_sure", label: "Not sure" },
];

// ---------------------------------------------------------------------------
// Reading saved rows
// ---------------------------------------------------------------------------

export type ReportedTriage = {
  issueType: IssueType | null;
  equipmentState: EquipmentState | null;
  responseNeed: ResponseNeed | null;
  damageSeverity: DamageSeverity | null;
};

/** The pre-D2 damage-report urgency. The old form pre-selected "medium", so only "high" carries any signal. */
export type LegacyUrgency = Urgency;

export const LEGACY_URGENCY_LABELS: Record<LegacyUrgency, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

export function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Triage answers from a saved row, or null when the row predates the triage questions. Unknown values → null. */
export function readTriage(data: unknown): ReportedTriage | null {
  const obj = asRecord(data);
  if (obj[TRIAGE_VERSION_FIELD] !== TRIAGE_VERSION) return null;
  return {
    issueType: oneOf(ISSUE_TYPES, obj[TRIAGE_FIELDS.issueType]),
    equipmentState: oneOf(EQUIPMENT_STATES, obj[TRIAGE_FIELDS.equipmentState]),
    responseNeed: oneOf(RESPONSE_NEEDS, obj[TRIAGE_FIELDS.responseNeed]),
    damageSeverity: oneOf(DAMAGE_SEVERITIES, obj[TRIAGE_FIELDS.damageSeverity]),
  };
}

/** The legacy damage urgency, when present and valid. */
export function readLegacyUrgency(data: unknown): LegacyUrgency | null {
  const raw = asRecord(data).urgency;
  return typeof raw === "string" ? oneOf(URGENCY_LEVELS, raw.trim()) : null;
}
