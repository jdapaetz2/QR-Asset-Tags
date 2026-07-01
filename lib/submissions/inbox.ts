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

export type SubmissionFilters = {
  formType: FilterFormType | "";
  status: SubmissionStatus | "";
  assetId: string;
  hasMedia: boolean;
  q: string;
};

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
  /** Filter params this chip applies; an empty object clears everything ("All"). */
  params: Partial<SubmissionFilters>;
};

/** Quick-filter chips for the inbox toolbar. Order matters (left → right). */
export const QUICK_FILTERS: QuickFilter[] = [
  { key: "all", label: "All", params: {} },
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
    // "All" only matches when nothing is set.
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
