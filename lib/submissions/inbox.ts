/**
 * Pure helpers for the ops-grade submission inbox. No I/O. These drive the list
 * layout (reference numbers, media/urgency indicators, filter parsing, quick-filter
 * chips) so the page component stays a thin data-fetch + render. Reference numbers
 * are display-only — derived from id + created_at, never stored (no DB sequence).
 */

import type { BadgeTone } from "@/lib/ui/status";
import {
  SUBMISSION_STATUSES,
  isSubmissionStatus,
  type SubmissionStatus,
} from "@/lib/submissions/display";

/** Form types the inbox filters on (matches the three public forms). */
export const FILTER_FORM_TYPES = [
  "damage_report",
  "support_request",
  "return_checklist",
] as const;
export type FilterFormType = (typeof FILTER_FORM_TYPES)[number];

export function isFilterFormType(value: unknown): value is FilterFormType {
  return (
    typeof value === "string" &&
    (FILTER_FORM_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Display-only reference like `SUB-2026-1A2B3C`. Year comes from the submission's
 * created_at; the suffix is the first six hex characters of the id, uppercased.
 * Deterministic and stable for a given submission — no DB column or sequence.
 */
export function submissionReference(id: string, createdAt: string): string {
  const d = new Date(createdAt);
  const year = Number.isNaN(d.getTime())
    ? "0000"
    : String(d.getUTCFullYear()).padStart(4, "0");
  const suffix = (id ?? "")
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6)
    .toUpperCase()
    .padEnd(6, "0");
  return `SUB-${year}-${suffix}`;
}

/** Attachment count from the stored `media_urls` array (safe on non-arrays). */
export function mediaCount(mediaUrls: unknown): number {
  return Array.isArray(mediaUrls) ? mediaUrls.length : 0;
}

export function hasMedia(mediaUrls: unknown): boolean {
  return mediaCount(mediaUrls) > 0;
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

/**
 * Whether a stored media path points at a displayable image. Upload object names
 * carry the extension (`<uuid>.jpg|png|webp`; non-images become `.bin`), so the
 * type is derivable from the path without fetching the object.
 */
export function isImagePath(path: unknown): boolean {
  if (typeof path !== "string") return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

/** First image path in a `media_urls` array, or null when none is an image. */
export function firstImagePath(mediaUrls: unknown): string | null {
  if (!Array.isArray(mediaUrls)) return null;
  for (const path of mediaUrls) {
    if (isImagePath(path)) return path as string;
  }
  return null;
}

/**
 * Urgency for a submission. Only damage reports carry an urgency level (stored in
 * `submission_data_json.urgency`); everything else returns null so no badge shows.
 */
export function submissionUrgency(
  formType: string,
  data: unknown
): string | null {
  if (formType !== "damage_report") return null;
  const obj =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const raw = obj.urgency;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Visual tone for an urgency level. Unknown levels stay neutral. */
export function urgencyTone(urgency: string): BadgeTone {
  switch (urgency) {
    case "high":
      return "danger";
    case "medium":
      return "warning";
    case "low":
    default:
      return "neutral";
  }
}

/**
 * Operational (non-archived) statuses. The default inbox shows only these; archived
 * submissions surface only when Archived is deliberately selected.
 */
export const ACTIVE_STATUSES = ["new", "reviewed", "resolved"] as const;

export type StatusFilter =
  | { mode: "active"; statuses: readonly SubmissionStatus[] }
  | { mode: "single"; status: SubmissionStatus };

/**
 * Resolve the status query into a DB filter. No status → "active" (excludes
 * archived); a specific status → that status only (including "archived"). This is
 * the single source of truth for "archived hidden by default".
 */
export function resolveStatusFilter(status: SubmissionStatus | ""): StatusFilter {
  if (status === "") {
    return { mode: "active", statuses: ACTIVE_STATUSES };
  }
  return { mode: "single", status };
}

export type SubmissionFilters = {
  formType: FilterFormType | "";
  status: SubmissionStatus | "";
  assetId: string;
  hasMedia: boolean;
  q: string;
};

/** Minimal row shape the in-memory search matches against. */
export type SubmissionSearchable = {
  id: string;
  created_at: string;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_by_phone: string | null;
  asset: { asset_code: string; asset_name: string } | null;
};

/**
 * Case-insensitive substring search over submitter (name/email/phone), asset
 * (code/name), and the display reference. Runs in memory over the RLS-scoped rows
 * (org-bounded), so it can span joined + computed fields a single SQL filter can't.
 * An empty query matches everything.
 */
export function matchesSearch(
  row: SubmissionSearchable,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.submitted_by_name,
    row.submitted_by_email,
    row.submitted_by_phone,
    row.asset?.asset_code,
    row.asset?.asset_name,
    submissionReference(row.id, row.created_at),
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

/**
 * Normalize raw search params into validated inbox filters. Unknown form types /
 * statuses collapse to "" (show all) so a hand-edited URL can never inject a value.
 */
export function parseSubmissionFilters(
  raw: Record<string, string | string[] | undefined>
): SubmissionFilters {
  const formTypeRaw = firstString(raw.form_type);
  const statusRaw = firstString(raw.status);
  const media = firstString(raw.media);
  return {
    formType: isFilterFormType(formTypeRaw) ? formTypeRaw : "",
    status: isSubmissionStatus(statusRaw) ? statusRaw : "",
    assetId: firstString(raw.asset_id),
    hasMedia: media === "1" || media === "true",
    q: firstString(raw.q).trim(),
  };
}

/** Query-string for a set of filters, omitting empties (used by chips + export). */
export function submissionFilterQuery(
  filters: Partial<SubmissionFilters>
): string {
  const params = new URLSearchParams();
  if (filters.formType) params.set("form_type", filters.formType);
  if (filters.status) params.set("status", filters.status);
  if (filters.assetId) params.set("asset_id", filters.assetId);
  if (filters.hasMedia) params.set("media", "1");
  if (filters.q) params.set("q", filters.q);
  return params.toString();
}

export type QuickFilter = {
  key: string;
  label: string;
  /** Filter params this chip applies; an empty object is the default "All active". */
  params: Partial<SubmissionFilters>;
};

/**
 * Quick-filter chips for the inbox toolbar. Order matters (left → right). "All
 * active" (default) and the type/media chips exclude archived; Archived is a
 * deliberate chip that shows archived rows only.
 */
export const QUICK_FILTERS: QuickFilter[] = [
  { key: "all", label: "All active", params: {} },
  { key: "new", label: "New", params: { status: "new" } },
  {
    key: "damage",
    label: "Damage reports",
    params: { formType: "damage_report" },
  },
  {
    key: "support",
    label: "Support requests",
    params: { formType: "support_request" },
  },
  {
    key: "return",
    label: "Return checklists",
    params: { formType: "return_checklist" },
  },
  { key: "media", label: "Has attachments", params: { hasMedia: true } },
  { key: "archived", label: "Archived", params: { status: "archived" } },
];

/** Which quick-filter chip (if any) exactly matches the active filters. */
export function activeQuickFilterKey(filters: SubmissionFilters): string | null {
  for (const chip of QUICK_FILTERS) {
    const p = chip.params;
    const matches =
      (p.status ?? "") === filters.status &&
      (p.formType ?? "") === filters.formType &&
      Boolean(p.hasMedia) === filters.hasMedia &&
      (p.assetId ?? "") === filters.assetId &&
      !filters.q;
    // "All active" only matches when nothing is set (no archived, no other filters).
    if (chip.key === "all") {
      if (
        !filters.status &&
        !filters.formType &&
        !filters.hasMedia &&
        !filters.assetId &&
        !filters.q
      ) {
        return "all";
      }
      continue;
    }
    if (matches) return chip.key;
  }
  return null;
}

// Re-export for convenience so the page imports statuses from one module.
export { SUBMISSION_STATUSES };
