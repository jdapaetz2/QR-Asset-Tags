/**
 * Engineering Phase D1 — the storage contract for REPORTED triage answers, established before any form writes them.
 * Pure and client-safe (no I/O, no server-only import) so the D2 public forms, the admin UI and the notification
 * projection all read one vocabulary.
 *
 * D2 stores these top-level keys in `submission_data_json`, alongside `triage_version: 1`:
 *   - `issue_type`       support requests
 *   - `equipment_state`  damage reports
 *   - `response_need`    damage reports and support requests
 *   - `damage_severity`  damage reports (displayed only — it never raises notification priority)
 *
 * Every value is the SUBMITTER's selection. Labels are always presented as "Reported …" and never describe a
 * verified mechanical, damage, recovery or safety determination. `unknown` is a "Not sure" answer and behaves
 * exactly like an omitted one.
 *
 * Until a row carries `triage_version: 1`, `readTriage` returns null: a row written before D2 was never asked these
 * questions, and nothing here pretends it was.
 */
import { URGENCY_LEVELS, type Urgency } from "@/lib/forms/validate";

export const TRIAGE_VERSION = 1;

export const ISSUE_TYPES = [
  "breakdown_no_start",
  "stuck_recovery",
  "rollover_safety",
  "operating_question",
  "other",
  "unknown",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const EQUIPMENT_STATES = [
  "operating",
  "operating_limited",
  "not_operating",
  "cannot_be_moved",
  "unsafe",
  "unknown",
] as const;
export type EquipmentState = (typeof EQUIPMENT_STATES)[number];

export const RESPONSE_NEEDS = ["routine", "prompt", "immediate", "unknown"] as const;
export type ResponseNeed = (typeof RESPONSE_NEEDS)[number];

export const DAMAGE_SEVERITIES = ["minor", "moderate", "major", "unknown"] as const;
export type DamageSeverity = (typeof DAMAGE_SEVERITIES)[number];

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  breakdown_no_start: "Breakdown or no-start",
  stuck_recovery: "Stuck or needs recovery",
  rollover_safety: "Rollover or safety incident",
  operating_question: "Operating question",
  other: "Other",
  unknown: "Not sure",
};

export const EQUIPMENT_STATE_LABELS: Record<EquipmentState, string> = {
  operating: "Operating",
  operating_limited: "Operating with limitations",
  not_operating: "Not operating",
  cannot_be_moved: "Cannot be moved",
  unsafe: "Unsafe to operate",
  unknown: "Not sure",
};

export const RESPONSE_NEED_LABELS: Record<ResponseNeed, string> = {
  routine: "No immediate response needed",
  prompt: "Follow up soon",
  immediate: "Help needed now",
  unknown: "Not sure",
};

export const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
  unknown: "Not sure",
};

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

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Triage answers from a saved row, or null when the row predates the triage questions. Unknown values become null. */
export function readTriage(data: unknown): ReportedTriage | null {
  const obj = asRecord(data);
  if (obj.triage_version !== TRIAGE_VERSION) return null;
  return {
    issueType: oneOf(ISSUE_TYPES, obj.issue_type),
    equipmentState: oneOf(EQUIPMENT_STATES, obj.equipment_state),
    responseNeed: oneOf(RESPONSE_NEEDS, obj.response_need),
    damageSeverity: oneOf(DAMAGE_SEVERITIES, obj.damage_severity),
  };
}

/** The legacy damage urgency, when present and valid. */
export function readLegacyUrgency(data: unknown): LegacyUrgency | null {
  const raw = asRecord(data).urgency;
  return typeof raw === "string" ? oneOf(URGENCY_LEVELS, raw.trim()) : null;
}
