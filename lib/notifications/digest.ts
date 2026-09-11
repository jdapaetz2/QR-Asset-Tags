/**
 * Engineering Phase D3B — what the daily return-exceptions summary lists. Pure, no I/O.
 *
 * Locked behaviour (docs/ACTIONABLE_NOTIFICATION_DESIGN.md §9.4–§9.5, §16 #11 and #16):
 *   - Every return checklist in scope created since the organization's last successful summary that has at least one
 *     RETURN EXCEPTION (§5.3: damage, failed required check, does not start/operate, missing accessory), listed with
 *     its CURRENT status — not only unresolved ones.
 *   - Excluded: clean returns, photo-gap-only returns and failed optional checks (routine, not exceptions).
 *   - Scope by mode: `instant_renter` → staff returns only (renter returns were already emailed individually);
 *     `daily_exceptions` → renter and staff returns.
 *
 * Classification reuses the one return reader (return-summary.ts) and the D1 exception rule (priority.ts), so the
 * summary can never disagree with an individual email about what counts. Free text is one-lined and capped; no
 * storage path, media URL or raw JSON leaves this module.
 */
import { cleanText } from "@/lib/notifications/projection";
import { returnExceptionCount } from "@/lib/notifications/priority";
import { summarizeReturnChecklist } from "@/lib/notifications/return-summary";
import type { ReturnNotificationMode } from "@/lib/notifications/settings";
import { isUnresolvedStatus, mediaCount, submissionReference } from "@/lib/submissions/inbox";
import { normalizeOrigin } from "@/lib/submissions/origin";

export type DigestOrigin = "public" | "staff";
export type DigestMode = Exclude<ReturnNotificationMode, "off">;

export function isDigestMode(value: unknown): value is DigestMode {
  return value === "instant_renter" || value === "daily_exceptions";
}

/** Which return origins a mode summarizes. */
export function digestOrigins(mode: DigestMode): DigestOrigin[] {
  return mode === "instant_renter" ? ["staff"] : ["public", "staff"];
}

/** The only columns the summary loads for a return checklist. */
export type DigestReturnRow = {
  id: string;
  organization_id: string;
  created_at: string;
  status: string;
  submission_origin: string | null;
  asset_id: string | null;
  submission_data_json: unknown;
  media_urls: unknown;
};

export type DigestAsset = { id: string; asset_code: string | null; asset_name: string | null };

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewed: "Reviewed",
  resolved: "Resolved",
  archived: "Archived",
};

const LABEL_LIMIT = 120;
/** Exception lines per item before collapsing into "and N more". */
export const DIGEST_MAX_EXCEPTION_LINES = 6;

export type DigestItem = {
  id: string;
  reference: string;
  createdAt: string;
  statusLabel: string;
  /** New or Reviewed. */
  open: boolean;
  source: DigestOrigin;
  sourceLabel: "Renter" | "Staff";
  assetCode: string | null;
  assetName: string | null;
  /** 1 = damage or does not start/operate; 2 = failed required checks or missing accessories. */
  group: 1 | 2;
  exceptions: string[];
  photoCount: number;
  recordUrl: string;
};

function exceptionLines(summary: ReturnType<typeof summarizeReturnChecklist>): string[] {
  const lines: string[] = [];
  if (summary.damage) {
    const location = cleanText(summary.damageLocation, LABEL_LIMIT);
    const severity = cleanText(summary.damageSeverityLabel, 40);
    lines.push(`Damage${location ? `: ${location}` : ""}${severity ? ` (${severity})` : ""}`);
  }
  for (const label of summary.notOperating) {
    lines.push(`Does not start or operate: ${cleanText(label, LABEL_LIMIT) ?? "operating check"}`);
  }
  for (const label of summary.failedRequired) {
    lines.push(`Failed check: ${cleanText(label, LABEL_LIMIT) ?? "required check"}`);
  }
  if (summary.accessoriesMissing) {
    const labels = summary.missingAccessoryLabels
      .map((label) => cleanText(label, LABEL_LIMIT))
      .filter((label): label is string => Boolean(label));
    if (labels.length === 0) lines.push("Missing accessories");
    for (const label of labels) lines.push(`Missing accessory: ${label}`);
  }
  if (lines.length <= DIGEST_MAX_EXCEPTION_LINES) return lines;
  const kept = lines.slice(0, DIGEST_MAX_EXCEPTION_LINES - 1);
  return [...kept, `and ${lines.length - kept.length} more on the record`];
}

/**
 * One summary line for a saved return checklist, or null when it has no return exception (clean, photo-gap-only or
 * failed-optional-only returns are not listed).
 */
export function projectDigestItem(row: DigestReturnRow, asset: DigestAsset | null, siteUrl: string): DigestItem | null {
  const summary = summarizeReturnChecklist(row.submission_data_json);
  if (returnExceptionCount(summary) === 0) return null;
  const source = normalizeOrigin(row.submission_origin) === "staff" ? "staff" : "public";
  return {
    id: row.id,
    reference: submissionReference(row.id, row.created_at),
    createdAt: row.created_at,
    statusLabel: STATUS_LABELS[row.status] ?? "Unknown",
    open: isUnresolvedStatus(row.status),
    source,
    sourceLabel: source === "staff" ? "Staff" : "Renter",
    assetCode: cleanText(asset?.asset_code, LABEL_LIMIT),
    assetName: cleanText(asset?.asset_name, LABEL_LIMIT),
    group: summary.damage || summary.notOperating.length > 0 ? 1 : 2,
    exceptions: exceptionLines(summary),
    photoCount: mediaCount(row.media_urls),
    recordUrl: `${siteUrl}/dashboard/submissions/${encodeURIComponent(row.id)}`,
  };
}

function timeOf(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/** Damage / does-not-operate first, then failed checks / missing accessories; oldest first within each group. */
export function sortDigestItems(items: DigestItem[]): DigestItem[] {
  return [...items].sort(
    (a, b) => a.group - b.group || timeOf(a.createdAt) - timeOf(b.createdAt) || a.id.localeCompare(b.id)
  );
}
