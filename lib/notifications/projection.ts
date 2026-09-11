/**
 * Engineering Phase D1 — the one normalized notification brief. Pure, no I/O.
 *
 * Every submission notification is projected from the COMMITTED `form_submissions` row plus trusted server lookups
 * (the asset and the organization name) — never from values carried across the commit from the browser. The brief
 * hides every historical JSON shape from the renderer: `lib/notifications/email.ts` receives this object and never
 * `submission_data_json`.
 *
 * Nothing here is rendered verbatim without escaping, and `photos.previewCandidates` is server-only metadata for the
 * D4 preview builder: its paths are never rendered, logged or placed in an idempotency key.
 */
import { PREFERRED_CONTACT_METHODS } from "@/lib/forms/validate";
import { submissionPathPrefix } from "@/lib/forms/media";
import { parseSubmissionObjectPath } from "@/lib/ratelimit/orphan";
import { isImagePath, mediaCount, submissionReference } from "@/lib/submissions/inbox";
import { normalizeOrigin, submissionTypeLabel } from "@/lib/submissions/origin";
import { mailtoHref, telHref } from "@/lib/contact/links";
import {
  DAMAGE_PHOTOS_SLOT,
  summarizeReturnChecklist,
  type ReturnChecklistSummary,
} from "@/lib/notifications/return-summary";
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
const PREVIEW_LABEL_LIMIT = 60;

type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

/**
 * A photo eligible for an inline preview (D4). SERVER-ONLY: the path is read by the preview builder and never rendered
 * or logged; the label is display text (escaped by the renderer); rank orders the candidates.
 *
 *   1  damage photo (return `damage_photos` slot; every damage-report photo)
 *   2  issue-specific photo (any other or custom return slot; every support-request photo)
 *   3  overall condition photo (the system templates' overview slots)
 *   4  additional photo
 */
export type PreviewCandidate = { path: string; label: string; rank: 1 | 2 | 3 | 4 };

/** The system templates' overall-condition photo slots (lib/inspections/templates.ts). */
export const OVERVIEW_PHOTO_SLOTS: ReadonlySet<string> = new Set([
  "overall_photo",
  "front_hitch_photo",
  "deck_photo",
  "attachment_photo",
  "equipment_case_photo",
  "overview_photos",
]);
export const ADDITIONAL_PHOTOS_SLOT = "additional_photos";

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
    /** SERVER-ONLY preview candidates, ranked and capped at three. Paths are never rendered, never logged. */
    previewCandidates: PreviewCandidate[];
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
    email,
    emailHref: mailtoHref(row.submitted_by_email),
    phoneHref: telHref(row.submitted_by_phone),
  };
}

/**
 * True only for a stored image that belongs to exactly this submission: a strict server-built
 * `org/{uuid}/asset/{uuid}/submission/{uuid}/{file}` path whose three ids match, no traversal, an image extension.
 * Used by the projection and re-checked by the preview builder immediately before a read.
 */
export function isPreviewPath(
  path: string,
  owner: { organizationId: string; assetId: string; submissionId: string }
): boolean {
  if (typeof path !== "string" || path.includes("..") || !isImagePath(path)) return false;
  if (!path.startsWith(`${submissionPathPrefix(owner.organizationId, owner.assetId, owner.submissionId)}/`)) return false;
  const parsed = parseSubmissionObjectPath(path);
  return (
    parsed !== null &&
    parsed.organizationId === owner.organizationId &&
    parsed.assetId === owner.assetId &&
    parsed.submissionId === owner.submissionId
  );
}

/**
 * Preview candidates: at most three stored image paths that belong to THIS submission — listed in its own
 * `media_urls` and under its own server-built prefix — ranked damage first. Metadata only; nothing is read here.
 */
function previewCandidates(row: SavedSubmissionRow, ordered: PreviewCandidate[]): PreviewCandidate[] {
  if (!row.asset_id) return [];
  const owner = { organizationId: row.organization_id, assetId: row.asset_id, submissionId: row.id };
  const media = new Set(Array.isArray(row.media_urls) ? row.media_urls.filter(isString) : []);
  const seen = new Set<string>();
  const eligible: (PreviewCandidate & { order: number })[] = [];
  ordered.forEach((candidate, order) => {
    if (seen.has(candidate.path) || !media.has(candidate.path) || !isPreviewPath(candidate.path, owner)) return;
    seen.add(candidate.path);
    eligible.push({ ...candidate, order });
  });
  return eligible
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, MAX_PREVIEW_CANDIDATES)
    .map(({ path, label, rank }) => ({ path, label, rank }));
}

function slotRank(slotId: string): PreviewCandidate["rank"] {
  if (slotId === DAMAGE_PHOTOS_SLOT) return 1;
  if (OVERVIEW_PHOTO_SLOTS.has(slotId)) return 3;
  if (slotId === ADDITIONAL_PHOTOS_SLOT) return 4;
  return 2;
}

function previewLabel(value: string, fallback: string): string {
  return cleanText(value, PREVIEW_LABEL_LIMIT) ?? fallback;
}

/** Returns preview only when the checklist has a return exception; clean and routine-only returns show a count. */
function returnPreviewCandidates(row: SavedSubmissionRow, summary: ReturnChecklistSummary): PreviewCandidate[] {
  if (returnExceptionCount(summary) === 0) return [];
  const slotted: PreviewCandidate[] = summary.slotPathEntries.map((entry) => ({
    path: entry.path,
    label: previewLabel(entry.label, "Return photo"),
    rank: slotRank(entry.slotId),
  }));
  const media = Array.isArray(row.media_urls) ? row.media_urls.filter(isString) : [];
  const unslotted: PreviewCandidate[] = media.map((path) => ({ path, label: "Return photo", rank: 4 }));
  return previewCandidates(row, [...slotted, ...unslotted]);
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
        previewCandidates: returnPreviewCandidates(row, summary),
      },
    };
  }

  const decision = priorityForReport(formType, data);
  const isDamage = formType === "damage_report";
  return {
    ...common,
    event: isDamage ? "damage_report" : "support_request",
    priority: decision.priority,
    headline: decision.headline,
    reported: reportedValuesFor(formType, data),
    description: excerpt(data.description, DESCRIPTION_LIMIT),
    returnDetail: null,
    photos: {
      count: mediaCount(row.media_urls),
      slotCounts: [],
      previewCandidates: previewCandidates(
        row,
        media.map((path) =>
          isDamage
            ? { path, label: "Damage report photo", rank: 1 as const }
            : { path, label: "Support request photo", rank: 2 as const }
        )
      ),
    },
  };
}
