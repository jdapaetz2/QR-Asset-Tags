/**
 * Pure helpers for customer tag requests. No I/O and never reads
 * `organization_id` — the server action derives org + requester from the profile.
 * Material / mounting / tag size reuse the production tag-metadata option lists.
 */

import {
  MATERIAL_OPTIONS,
  MOUNTING_OPTIONS,
  TAG_SIZE_OPTIONS,
} from "@/lib/qr/production";

export const TAG_REQUEST_STATUSES = [
  "requested",
  "in_review",
  "in_production",
  "ready",
  "delivered",
  "cancelled",
] as const;
export type TagRequestStatus = (typeof TAG_REQUEST_STATUSES)[number];

export function isTagRequestStatus(value: unknown): value is TagRequestStatus {
  return (
    typeof value === "string" &&
    (TAG_REQUEST_STATUSES as readonly string[]).includes(value)
  );
}

const STATUS_LABELS: Record<TagRequestStatus, string> = {
  requested: "Requested",
  in_review: "In review",
  in_production: "In production",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function tagRequestStatusLabel(status: string): string {
  return isTagRequestStatus(status) ? STATUS_LABELS[status] : status;
}

/**
 * "Viewed" tracking is independent of status — `platform_viewed_at` records when
 * the platform admin opened a request, so unviewed requests surface as new work.
 */
export const VIEWED_FILTERS = ["all", "unviewed"] as const;
export type ViewedFilter = (typeof VIEWED_FILTERS)[number];

export function parseViewedFilter(value: unknown): ViewedFilter {
  return value === "unviewed" ? "unviewed" : "all";
}

/** Count unviewed (platform_viewed_at null) requests per organization. */
export function unviewedCountByOrg(
  rows: { organization_id: string; platform_viewed_at: string | null }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.platform_viewed_at === null) {
      counts.set(r.organization_id, (counts.get(r.organization_id) ?? 0) + 1);
    }
  }
  return counts;
}

export type TagRequestInput = {
  material: string;
  mounting_method: string;
  tag_size: string;
  quantity_notes: string | null;
};

export type TagRequestResult =
  | { value: TagRequestInput; error?: undefined }
  | { value?: undefined; error: string };

export type RawTagRequestForm = Record<string, string | undefined>;

function clean(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function inList(value: string | null, list: readonly string[]): boolean {
  return value !== null && list.includes(value);
}

/** Validate the request's tag-spec fields. Asset selection is checked separately. */
export function validateTagRequest(raw: RawTagRequestForm): TagRequestResult {
  const material = clean(raw.material);
  if (!inList(material, MATERIAL_OPTIONS)) {
    return { error: "Choose a tag material." };
  }
  const mounting_method = clean(raw.mounting_method);
  if (!inList(mounting_method, MOUNTING_OPTIONS)) {
    return { error: "Choose a mounting method." };
  }
  const tag_size = clean(raw.tag_size);
  if (!inList(tag_size, TAG_SIZE_OPTIONS)) {
    return { error: "Choose a tag size." };
  }

  return {
    value: {
      material: material as string,
      mounting_method: mounting_method as string,
      tag_size: tag_size as string,
      quantity_notes: clean(raw.quantity_notes),
    },
  };
}
