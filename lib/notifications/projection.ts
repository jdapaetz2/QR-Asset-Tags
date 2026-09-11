/**
 * Engineering Phase D1 — the one normalized notification brief. Pure, no I/O.
 *
 * Every submission notification is projected from the COMMITTED `form_submissions` row plus trusted server lookups
 * (the asset and the organization name) — never from values carried across the commit from the browser. The brief
 * hides every historical JSON shape from the renderer: `lib/notifications/email.ts` receives this object and never
 * `submission_data_json`.
 *
 * Nothing here is rendered verbatim without escaping, and `photos.previewCandidates` is server-only metadata for a
 * later slice: it is never rendered, logged or placed in an idempotency key.
 */
import { PREFERRED_CONTACT_METHODS } from "@/lib/forms/validate";
import { submissionPathPrefix } from "@/lib/forms/media";
import { isImagePath, mediaCount, submissionReference } from "@/lib/submissions/inbox";
import { normalizeOrigin, submissionTypeLabel } from "@/lib/submissions/origin";
import { mailtoHref, telHref } from "@/lib/contact/links";
import { summarizeReturnChecklist, type ReturnChecklistSummary } from "@/lib/notifications/return-summary";
import {
  priorityForReport,
  reportedValuesFor,
  returnExceptionCount,
  returnPriority,
  type NotificationPriority,
  type ReportedValues,
} from "@/lib/notifications/priority";
import type { SubmissionFormType } from "@/lib/notifications/settings";

/** The only columns the notifier loads. Raw JSON stays inside this module. */
export const SAVED_SUBMISSION_COLUMNS =
  "id, organization_id, asset_id, form_type, submission_origin, created_at, rental_session_id, submitted_by_name, submitted_by_email, submitted_by_phone, submission_data_json, media_urls";

export type SavedSubmissionRow = {
  id: string;
  organization_id: string;
  asset_id: string | null;
  form_type: string;
  submission_origin: string | null;
  created_at: string;
  rental_session_id: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_by_phone: string | null;
  submission_data_json: unknown;
  media_urls: unknown;
};

export type BriefAsset = { code: string | null; name: string | null; category: string | null };

/** Where a notification came from: a public renter form, an authenticated staff workflow, or a system workflow. */
export type NotificationSource = "public" | "staff" | "system";

export type Excerpt = { text: string; truncated: boolean };

export const DESCRIPTION_LIMIT = 300;
export const LOCATION_LIMIT = 120;
export const LABEL_LIMIT = 120;
const NAME_LIMIT = 120;
const PHONE_LIMIT = 40;
const EMAIL_LIMIT = 254;
export const MAX_PREVIEW_CANDIDATES = 3;

type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

export type ReturnDetail = {
  exceptionCount: number;
  damage: boolean;
  damageLocation: Excerpt | null;
  damageSeverityLabel: string | null;
  damageDescription: Excerpt | null;
  failedRequired: string[];
  notOperating: string[];
  accessoriesMissing: boolean;
  missingAccessoryLabels: string[];
  /** Routine notes: photo gaps and failed optional checks. */
  notes: string[];
};

export type NotificationBrief = {
  event: "damage_report" | "support_request" | "renter_return";
  formType: SubmissionFormType;
  eventLabel: string;
  source: NotificationSource;
  reference: string;
  organizationName: string;
  asset: BriefAsset;
  priority: NotificationPriority;
  headline: string;
  reported: ReportedValues;
  description: Excerpt | null;
  returnDetail: ReturnDetail | null;
  contact: {
    name: string | null;
    preferredMethod: PreferredContactMethod | null;
    phone: string | null;
    phoneHref: string | null;
    email: string | null;
    emailHref: string | null;
  };
  rentalSessionLinked: boolean;
  photos: {
    count: number;
    slotCounts: { label: string; count: number }[];
    /** SERVER-ONLY storage paths for a later preview slice. Never rendered, never logged. */
    previewCandidates: string[];
  };
  links: { record: string; settings: string };
};

/** Why a scheduled notification was refused after loading the saved record. Logged as a coarse class only. */
export type SavedSubmissionFailure =
  | "record_missing"
  | "organization_mismatch"
  | "asset_mismatch"
  | "form_type_mismatch"
  | "origin_mismatch"
  | "asset_missing";

/**
 * Fail closed unless the committed row is exactly the one the committing action scheduled: same organization,
 * same asset, same form type, submitted through the public intake, and an asset that belongs to the organization.
 */
export function checkSavedSubmission(
  expected: { organizationId: string; assetId: string; formType: SubmissionFormType },
  row: SavedSubmissionRow | null,
  asset: BriefAsset | null
): SavedSubmissionFailure | null {
  if (!row) return "record_missing";
  if (row.organization_id !== expected.organizationId) return "organization_mismatch";
  if (row.asset_id !== expected.assetId) return "asset_mismatch";
  if (row.form_type !== expected.formType) return "form_type_mismatch";
  if (normalizeOrigin(row.submission_origin) !== "public") return "origin_mismatch";
  if (!asset) return "asset_missing";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Collapse to one line: control characters and line/paragraph separators become spaces, runs of space collapse. */
function oneLine(value: string): string {
  return Array.from(value, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 || code === 0x2028 || code === 0x2029 ? " " : ch;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** A bounded, single-line excerpt with a clear truncation marker, or null when empty. */
export function excerpt(value: unknown, limit: number): Excerpt | null {
  if (typeof value !== "string") return null;
  const cleaned = oneLine(value);
  if (cleaned.length === 0) return null;
  if (cleaned.length <= limit) return { text: cleaned, truncated: false };
  const cut = cleaned.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return { text: `${base.trimEnd()}…`, truncated: true };
}

/** One line, control characters removed, capped — shared with the daily summary projection (D3B). */
export function cleanText(value: unknown, limit: number): string | null {
  return excerpt(value, limit)?.text ?? null;
}

function cleanLabels(labels: string[]): string[] {
  return labels.map((label) => cleanText(label, LABEL_LIMIT)).filter(isString);
}

function projectContact(row: SavedSubmissionRow, preferred: unknown): NotificationBrief["contact"] {
  const email = cleanText(row.submitted_by_email, EMAIL_LIMIT);
  const phone = cleanText(row.submitted_by_phone, PHONE_LIMIT);
  return {
    name: cleanText(row.submitted_by_name, NAME_LIMIT),
    preferredMethod:
      typeof preferred === "string" && (PREFERRED_CONTACT_METHODS as readonly string[]).includes(preferred)
        ? (preferred as PreferredContactMethod)
        : null,
    phone,
    phoneHref: telHref(row.submitted_by_phone),
    email,
    emailHref: mailtoHref(row.submitted_by_email),
  };
}

/**
 * Preview candidates: at most three stored image paths that belong to THIS submission — listed in its own
 * `media_urls` and under its own server-built prefix. Metadata only; nothing is read from storage here.
 */
function previewCandidates(row: SavedSubmissionRow, preferredOrder: string[]): string[] {
  if (!row.asset_id) return [];
  const media = Array.isArray(row.media_urls) ? row.media_urls.filter(isString) : [];
  const allowed = new Set(media);
  const prefix = `${submissionPathPrefix(row.organization_id, row.asset_id, row.id)}/`;
  const out: string[] = [];
  for (const path of [...preferredOrder, ...media]) {
    if (out.length >= MAX_PREVIEW_CANDIDATES) break;
    if (out.includes(path) || !allowed.has(path)) continue;
    if (!path.startsWith(prefix) || path.includes("..") || !isImagePath(path)) continue;
    out.push(path);
  }
  return out;
}

function returnNotes(summary: ReturnChecklistSummary): string[] {
  const notes: string[] = [];
  if (summary.damagePhotosMissing) notes.push("Damage reported without photos");
  if (summary.conditionPhotosMissing) {
    notes.push("No condition photos provided");
  } else if (summary.missingRecommendedPhotos) {
    const labels = cleanLabels(summary.missingRecommendedSlotLabels);
    notes.push(
      labels.length > 0
        ? `Recommended photos not provided: ${labels.join(", ")}`
        : "Some recommended photos were not provided"
    );
  }
  for (const label of cleanLabels(summary.failedOptional)) notes.push(`Failed optional check: ${label}`);
  return notes;
}

/** The form types that are individually notified. Outbound inspections and unknown types are not. */
function individualFormType(value: string): SubmissionFormType | null {
  return value === "damage_report" || value === "support_request" || value === "return_checklist" ? value : null;
}

const NO_TRIAGE: ReportedValues = {
  triageRecorded: false,
  issueType: null,
  equipmentState: null,
  responseNeed: null,
  damageSeverity: null,
  legacyUrgency: null,
};

/**
 * Project a committed public submission into the brief. Returns null for anything the notifier does not send
 * individually (staff returns, outbound inspections, unknown form types) — the orchestrator validates first, so this
 * is a second, independent refusal rather than the only one.
 */
export function projectSubmissionBrief(input: {
  organizationName: string;
  row: SavedSubmissionRow;
  asset: BriefAsset;
  siteUrl: string;
}): NotificationBrief | null {
  const { row } = input;
  const formType = individualFormType(row.form_type);
  if (!formType) return null;
  const origin = normalizeOrigin(row.submission_origin);
  if (origin !== "public") return null;

  const data = asRecord(row.submission_data_json);
  const eventLabel = submissionTypeLabel(formType, origin);
  const media = Array.isArray(row.media_urls) ? row.media_urls.filter(isString) : [];

  const common = {
    formType,
    eventLabel,
    source: "public" as const,
    reference: submissionReference(row.id, row.created_at),
    organizationName: cleanText(input.organizationName, NAME_LIMIT) ?? "Your organization",
    asset: {
      code: cleanText(input.asset.code, LABEL_LIMIT),
      name: cleanText(input.asset.name, LABEL_LIMIT),
      category: cleanText(input.asset.category, LABEL_LIMIT),
    },
    contact: projectContact(row, formType === "support_request" ? data.preferred_contact_method : null),
    rentalSessionLinked: Boolean(row.rental_session_id),
    links: {
      record: `${input.siteUrl}/dashboard/submissions/${encodeURIComponent(row.id)}`,
      settings: `${input.siteUrl}/dashboard/settings`,
    },
  };

  if (formType === "return_checklist") {
    const summary = summarizeReturnChecklist(row.submission_data_json);
    const decision = returnPriority(summary, eventLabel);
    return {
      ...common,
      event: "renter_return",
      priority: decision.priority,
      headline: decision.headline,
      reported: NO_TRIAGE,
      description: null,
      returnDetail: {
        exceptionCount: returnExceptionCount(summary),
        damage: summary.damage,
        damageLocation: excerpt(summary.damageLocation, LOCATION_LIMIT),
        damageSeverityLabel: cleanText(summary.damageSeverityLabel, LABEL_LIMIT),
        damageDescription: excerpt(summary.damageDescription, DESCRIPTION_LIMIT),
        failedRequired: cleanLabels(summary.failedRequired),
        notOperating: cleanLabels(summary.notOperating),
        accessoriesMissing: summary.accessoriesMissing,
        missingAccessoryLabels: cleanLabels(summary.missingAccessoryLabels),
        notes: returnNotes(summary),
      },
      photos: {
        count: mediaCount(row.media_urls),
        slotCounts: summary.slotCounts.map((slot) => ({
          label: cleanText(slot.label, LABEL_LIMIT) ?? "Photos",
          count: slot.count,
        })),
        previewCandidates: previewCandidates(row, summary.slotPaths),
      },
    };
  }

  const decision = priorityForReport(formType, data);
  return {
    ...common,
    event: formType === "damage_report" ? "damage_report" : "support_request",
    priority: decision.priority,
    headline: decision.headline,
    reported: reportedValuesFor(formType, data),
    description: excerpt(data.description, DESCRIPTION_LIMIT),
    returnDetail: null,
    photos: {
      count: mediaCount(row.media_urls),
      slotCounts: [],
      previewCandidates: previewCandidates(row, media),
    },
  };
}
