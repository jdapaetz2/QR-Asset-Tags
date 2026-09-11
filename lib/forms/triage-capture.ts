/**
 * Engineering Phase D2 — reads the optional reported triage answers from a public damage or support form. Pure.
 *
 * The D2 forms post a hidden `triage_version=1` marker. With it, every answer is validated against its enum and an
 * unexpected value is ignored (stored as `null`, exactly like an omitted answer); any `urgency` field is ignored.
 * Without it — a page rendered before D2 and still open on a renter's phone — the post is stored in the legacy
 * shape it always used, so an old cached form keeps working and historical rows are never rewritten.
 *
 * `callNow` is computed from the VALIDATED values with the same deterministic rules as notifications. It only
 * decides whether the public confirmation page shows a call-now block; it unlocks no data and changes no state.
 */
import {
  DAMAGE_SEVERITIES,
  EQUIPMENT_STATES,
  ISSUE_TYPES,
  RESPONSE_NEEDS,
  TRIAGE_FIELDS,
  TRIAGE_VERSION,
  TRIAGE_VERSION_FIELD,
  oneOf,
} from "@/lib/submissions/triage";
import { priorityForReport, type ReportFormType } from "@/lib/notifications/priority";

export type TriageCapture = {
  /** The `submission_data_json` to store. Organization, asset, form type and status stay server-derived elsewhere. */
  dataJson: Record<string, unknown>;
  /** Only for a legacy post: the old urgency select, still checked by the existing validation rule. */
  legacyUrgency: string | null;
  /** Display-only: whether the confirmation page offers the call-now block. */
  callNow: boolean;
};

function formValue(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function hasTriageMarker(formData: FormData): boolean {
  return formValue(formData, TRIAGE_VERSION_FIELD) === String(TRIAGE_VERSION);
}

function isImmediate(formType: ReportFormType, dataJson: Record<string, unknown>): boolean {
  return priorityForReport(formType, dataJson).priority === "immediate";
}

export function captureDamageReport(formData: FormData, description: string | null): TriageCapture {
  if (!hasTriageMarker(formData)) {
    const urgency = formValue(formData, "urgency");
    const dataJson = { urgency: urgency ?? null, description };
    return { dataJson, legacyUrgency: urgency, callNow: isImmediate("damage_report", dataJson) };
  }
  const dataJson = {
    [TRIAGE_VERSION_FIELD]: TRIAGE_VERSION,
    [TRIAGE_FIELDS.equipmentState]: oneOf(EQUIPMENT_STATES, formValue(formData, TRIAGE_FIELDS.equipmentState)),
    [TRIAGE_FIELDS.responseNeed]: oneOf(RESPONSE_NEEDS, formValue(formData, TRIAGE_FIELDS.responseNeed)),
    [TRIAGE_FIELDS.damageSeverity]: oneOf(DAMAGE_SEVERITIES, formValue(formData, TRIAGE_FIELDS.damageSeverity)),
    description,
  };
  return { dataJson, legacyUrgency: null, callNow: isImmediate("damage_report", dataJson) };
}

export function captureSupportRequest(
  formData: FormData,
  fields: { preferredContactMethod: string | null; description: string | null }
): TriageCapture {
  if (!hasTriageMarker(formData)) {
    return {
      dataJson: { preferred_contact_method: fields.preferredContactMethod ?? null, description: fields.description },
      legacyUrgency: null,
      callNow: false,
    };
  }
  const dataJson = {
    [TRIAGE_VERSION_FIELD]: TRIAGE_VERSION,
    [TRIAGE_FIELDS.issueType]: oneOf(ISSUE_TYPES, formValue(formData, TRIAGE_FIELDS.issueType)),
    [TRIAGE_FIELDS.responseNeed]: oneOf(RESPONSE_NEEDS, formValue(formData, TRIAGE_FIELDS.responseNeed)),
    preferred_contact_method: fields.preferredContactMethod ?? null,
    description: fields.description,
  };
  return { dataJson, legacyUrgency: null, callNow: isImmediate("support_request", dataJson) };
}
