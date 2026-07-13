/**
 * Pure helpers for submission ORIGIN — the authenticated-staff vs public-renter distinction (Phase 3A.1).
 * No I/O. The authoritative value is `form_submissions.submission_origin` ('public' | 'staff'), server-set
 * and un-forgeable. These drive the type label + source badge in the inbox/detail and the same-session
 * related-record lookups, so staff and renter records read distinctly without opening a row.
 */
import type { BadgeTone } from "@/lib/ui/status";
import { formTypeLabel } from "@/lib/submissions/display";

export type SubmissionOrigin = "public" | "staff";

/** Distinct badge tone per form type so damage/support/return read at a glance (shared inbox + timeline). */
const FORM_TYPE_TONE: Record<string, BadgeTone> = {
  damage_report: "danger",
  support_request: "info",
  return_checklist: "success",
  pre_use_inspection: "neutral",
};

export function formTypeTone(formType: string): BadgeTone {
  return FORM_TYPE_TONE[formType] ?? "neutral";
}

/** Coerce an untyped value to a known origin (anything but "staff" is treated as public). */
export function normalizeOrigin(value: unknown): SubmissionOrigin {
  return value === "staff" ? "staff" : "public";
}

/** The other origin — used to find the same-session record from the opposite workflow. */
export function oppositeOrigin(origin: SubmissionOrigin): SubmissionOrigin {
  return origin === "staff" ? "public" : "staff";
}

/**
 * Human type label that folds in the origin. Return checklists read as "Renter return" (public) vs "Staff
 * return inspection" (staff); the outbound baseline is always "Outbound inspection". Other form types fall
 * back to their plain label.
 */
export function submissionTypeLabel(formType: string, origin: unknown): string {
  const o = normalizeOrigin(origin);
  if (formType === "pre_use_inspection") return "Outbound inspection";
  if (formType === "return_checklist") {
    return o === "staff" ? "Staff return inspection" : "Renter return";
  }
  return formTypeLabel(formType);
}

/**
 * The source chip (Renter / Staff) shown on records where the distinction matters — the return/outbound
 * family. Other public forms (damage/support) return null so the inbox isn't cluttered with a badge that
 * says nothing new.
 */
export function submissionSourceBadge(
  formType: string,
  origin: unknown
): { label: "Renter" | "Staff"; tone: BadgeTone } | null {
  if (formType !== "return_checklist" && formType !== "pre_use_inspection") return null;
  const o = normalizeOrigin(origin);
  return o === "staff"
    ? { label: "Staff", tone: "info" }
    : { label: "Renter", tone: "neutral" };
}
