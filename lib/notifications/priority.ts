/**
 * Engineering Phases D1–D2 — deterministic notification priority. Pure, no I/O.
 *
 * The operator-locked rules (docs/ACTIONABLE_NOTIFICATION_DESIGN.md §5), applied in order, first match wins:
 *
 *   Immediate attention  reported response need = immediate; reported equipment state = cannot be moved or unsafe to
 *                        operate; support issue type = rollover or safety incident. Never a return checklist.
 *   Follow up            response need = prompt; equipment state = not operating or operating with limitations;
 *                        support issue type = breakdown/no-start or stuck/recovery; legacy damage urgency = high
 *                        (only on rows without triage); a return checklist exception.
 *   Routine review       every other damage or support report; a return whose only notes are missing photos or
 *                        failed optional checks; unknown, `not_sure` or omitted triage.
 *   Record only          a clean return checklist; a tag-request status update.
 *
 * Priority is a presentation and routing result, never a safety certification, and it never changes an asset's
 * state. Nothing here reads free text: no description, note or label can move a report between levels. Reported
 * damage severity is displayed elsewhere and deliberately has no input here.
 */
import {
  readLegacyUrgency,
  readTriage,
  type DamageSeverity,
  type EquipmentState,
  type IssueType,
  type LegacyUrgency,
  type ReportedTriage,
  type ResponseNeed,
} from "@/lib/submissions/triage";
import { submissionTypeLabel } from "@/lib/submissions/origin";
import { summarizeReturnChecklist, type ReturnChecklistSummary } from "@/lib/notifications/return-summary";

export type NotificationPriority = "immediate" | "follow_up" | "routine" | "record";

export const PRIORITY_LABELS: Record<NotificationPriority, string> = {
  immediate: "Immediate attention",
  follow_up: "Follow up",
  routine: "Routine review",
  record: "Record only",
};

/** Operator-approved subject prefixes. Routine and record-only subjects carry none. */
export const SUBJECT_PREFIXES: Record<NotificationPriority, string> = {
  immediate: "Immediate attention: ",
  follow_up: "Follow up: ",
  routine: "",
  record: "",
};

export type PriorityDecision = { priority: NotificationPriority; headline: string };

export type ReportFormType = "damage_report" | "support_request";

/**
 * Damage reports and support requests. The headline is the phrase of the winning condition, checked in the design
 * §5.4 order. Equipment state is only collected on damage reports and issue type on support requests; callers pass
 * only the fields their form asks (see `reportedValuesFor`).
 */
export function reportPriority(input: {
  formType: ReportFormType;
  triage: ReportedTriage | null;
  legacyUrgency: LegacyUrgency | null;
}): PriorityDecision {
  const support = input.formType === "support_request";
  const triage = input.triage;

  if (triage) {
    if (support && triage.issueType === "rollover_safety") {
      return { priority: "immediate", headline: "reported rollover or safety incident" };
    }
    if (triage.equipmentState === "unsafe_to_operate") {
      return { priority: "immediate", headline: "reported unsafe to operate" };
    }
    if (triage.equipmentState === "cannot_be_moved") {
      return { priority: "immediate", headline: "reported unable to move" };
    }
    if (triage.responseNeed === "immediate") return { priority: "immediate", headline: "help requested now" };

    if (triage.equipmentState === "not_operating") return { priority: "follow_up", headline: "reported not operating" };
    if (support && triage.issueType === "breakdown_no_start") {
      return { priority: "follow_up", headline: "reported breakdown or no-start" };
    }
    if (support && triage.issueType === "stuck_recovery") {
      return { priority: "follow_up", headline: "reported stuck, recovery needed" };
    }
    if (triage.equipmentState === "operating_with_limitations") {
      return { priority: "follow_up", headline: "reported operating with limitations" };
    }
    if (triage.responseNeed === "prompt") return { priority: "follow_up", headline: "follow-up requested" };
  } else if (!support && input.legacyUrgency === "high") {
    // The pre-D2 form pre-selected "medium", so medium and low are not evidence of a deliberate choice.
    return { priority: "follow_up", headline: "reported urgency: high" };
  }

  return { priority: "routine", headline: support ? "support request" : "damage reported" };
}

/** The reported answers a saved report carries, limited to the questions its own form asks. */
export type ReportedValues = {
  /** True only when the row carries `triage_version: 1` — i.e. the form actually asked. */
  triageRecorded: boolean;
  issueType: IssueType | null;
  equipmentState: EquipmentState | null;
  responseNeed: ResponseNeed | null;
  damageSeverity: DamageSeverity | null;
  legacyUrgency: LegacyUrgency | null;
};

export function reportedValuesFor(formType: ReportFormType, data: unknown): ReportedValues {
  const damage = formType === "damage_report";
  const triage = readTriage(data);
  if (!triage) {
    return {
      triageRecorded: false,
      issueType: null,
      equipmentState: null,
      responseNeed: null,
      damageSeverity: null,
      legacyUrgency: damage ? readLegacyUrgency(data) : null,
    };
  }
  // Only the questions each form asks are carried, so a stray key can never influence the other form's rules.
  return {
    triageRecorded: true,
    issueType: damage ? null : triage.issueType,
    equipmentState: damage ? triage.equipmentState : null,
    responseNeed: triage.responseNeed,
    damageSeverity: damage ? triage.damageSeverity : null,
    legacyUrgency: null,
  };
}

/** Priority for a saved damage or support report, from its stored JSON. */
export function priorityForReport(formType: ReportFormType, data: unknown): PriorityDecision {
  const reported = reportedValuesFor(formType, data);
  return reportPriority({
    formType,
    triage: reported.triageRecorded
      ? {
          issueType: reported.issueType,
          equipmentState: reported.equipmentState,
          responseNeed: reported.responseNeed,
          damageSeverity: reported.damageSeverity,
        }
      : null,
    legacyUrgency: reported.legacyUrgency,
  });
}

/** Return exceptions: damage, each failed required check, each "does not start/operate", missing accessories. */
export function returnExceptionCount(summary: ReturnChecklistSummary): number {
  return (
    (summary.damage ? 1 : 0) +
    summary.failedRequired.length +
    summary.notOperating.length +
    (summary.accessoriesMissing ? 1 : 0)
  );
}

/** Photo gaps and failed optional checks: worth noting, never a return exception. */
export function hasRoutineReturnNotes(summary: ReturnChecklistSummary): boolean {
  return (
    summary.damagePhotosMissing ||
    summary.conditionPhotosMissing ||
    summary.missingRecommendedPhotos ||
    summary.failedOptional.length > 0
  );
}

/** Return checklists. Never immediate — the equipment is back; the data describes a follow-up. */
export function returnPriority(summary: ReturnChecklistSummary, eventLabel: string): PriorityDecision {
  const label = eventLabel.toLowerCase();
  const exceptions = returnExceptionCount(summary);
  if (exceptions > 0) {
    return {
      priority: "follow_up",
      headline: `${label}, ${exceptions} ${exceptions === 1 ? "exception" : "exceptions"}`,
    };
  }
  if (hasRoutineReturnNotes(summary)) return { priority: "routine", headline: `${label}, review when convenient` };
  return { priority: "record", headline: `${label}, no exceptions` };
}

/**
 * Notification priority for any saved submission row the admin UI displays: damage reports, support requests and
 * return checklists (either origin). Outbound inspections and unknown types have none.
 */
export function submissionPriority(row: {
  form_type: string;
  submission_origin?: string | null;
  submission_data_json: unknown;
}): PriorityDecision | null {
  if (row.form_type === "damage_report" || row.form_type === "support_request") {
    return priorityForReport(row.form_type, row.submission_data_json);
  }
  if (row.form_type === "return_checklist") {
    return returnPriority(
      summarizeReturnChecklist(row.submission_data_json),
      submissionTypeLabel(row.form_type, row.submission_origin)
    );
  }
  return null;
}
