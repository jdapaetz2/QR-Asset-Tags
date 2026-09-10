/**
 * Engineering Phase D1 — deterministic notification priority. Pure, no I/O.
 *
 * The operator-locked rules (docs/ACTIONABLE_NOTIFICATION_DESIGN.md §5), applied in order, first match wins:
 *
 *   Immediate attention  explicit triage: response need = immediate; equipment state = cannot be moved or unsafe;
 *                        support issue type = rollover or safety incident. Never a return checklist.
 *   Follow up            response need = prompt; equipment state = not operating or operating with limitations;
 *                        support issue type = breakdown/no-start or stuck/recovery; legacy damage urgency = high
 *                        (only on rows without triage); a return checklist exception.
 *   Routine review       every other damage or support report; a return whose only notes are missing photos or
 *                        failed optional checks; unknown or omitted triage.
 *   Record only          a clean return checklist; a tag-request status update.
 *
 * Priority is a presentation and routing result, never a safety certification, and it never changes an asset's
 * state. Nothing here reads free text: no description, note or label can move a report between levels. Reported
 * damage severity is displayed elsewhere and deliberately has no input here.
 */
import type { LegacyUrgency, ReportedTriage } from "@/lib/submissions/triage";
import type { ReturnChecklistSummary } from "@/lib/notifications/return-summary";

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

/**
 * Damage reports and support requests. The headline is the phrase of the winning condition, checked in the design
 * §5.4 order. Equipment state is only ever collected on damage reports and issue type on support requests; the
 * projection passes only the fields its form asks.
 */
export function reportPriority(input: {
  formType: "damage_report" | "support_request";
  triage: ReportedTriage | null;
  legacyUrgency: LegacyUrgency | null;
}): PriorityDecision {
  const support = input.formType === "support_request";
  const triage = input.triage;

  if (triage) {
    if (support && triage.issueType === "rollover_safety") {
      return { priority: "immediate", headline: "reported rollover or safety incident" };
    }
    if (triage.equipmentState === "unsafe") return { priority: "immediate", headline: "reported unsafe to operate" };
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
    if (triage.equipmentState === "operating_limited") {
      return { priority: "follow_up", headline: "reported operating with limitations" };
    }
    if (triage.responseNeed === "prompt") return { priority: "follow_up", headline: "follow-up requested" };
  } else if (!support && input.legacyUrgency === "high") {
    // The pre-D2 form pre-selected "medium", so medium and low are not evidence of a deliberate choice.
    return { priority: "follow_up", headline: "reported urgency: high" };
  }

  return { priority: "routine", headline: support ? "support request" : "damage reported" };
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
