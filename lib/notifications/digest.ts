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
 *
 * Engineering Phase D5.1 adds presentation grouping only — `groupDigestItems`, `digestCounters` and
 * `limitDigestSections`. They order and bound what is DISPLAYED; which returns are summarized is unchanged.
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
  /** D5.1: used only to mark returns from the same rental session; never rendered. */
  rental_session_id?: string | null;
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

export type DigestStatus = "new" | "reviewed" | "resolved" | "archived" | "unknown";

function digestStatus(value: string): DigestStatus {
  return value === "new" || value === "reviewed" || value === "resolved" || value === "archived" ? value : "unknown";
}

export type DigestIssueKind = "damage" | "not_operating" | "failed_check" | "missing_accessory";

export const DIGEST_ISSUE_LABELS: Record<DigestIssueKind, string> = {
  damage: "Damage",
  not_operating: "Does not operate",
  failed_check: "Failed check",
  missing_accessory: "Missing accessory",
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
  status: DigestStatus;
  source: DigestOrigin;
  sourceLabel: "Renter" | "Staff";
  assetId: string | null;
  assetCode: string | null;
  assetName: string | null;
  /** Grouping only, never rendered. */
  rentalSessionId: string | null;
  /** 1 = damage or does not start/operate; 2 = failed required checks or missing accessories. */
  group: 1 | 2;
  /** D5.1 display class: 1 = damage or does not operate; 2 = failed check; 3 = missing accessory only. */
  issueClass: 1 | 2 | 3;
  kinds: DigestIssueKind[];
  exceptionCount: number;
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
    lines.push(`Answered No: ${cleanText(label, LABEL_LIMIT) ?? "operating check"}`);
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
  const exceptionCount = returnExceptionCount(summary);
  if (exceptionCount === 0) return null;
  const source = normalizeOrigin(row.submission_origin) === "staff" ? "staff" : "public";
  const kinds: DigestIssueKind[] = [];
  if (summary.damage) kinds.push("damage");
  if (summary.notOperating.length > 0) kinds.push("not_operating");
  if (summary.failedRequired.length > 0) kinds.push("failed_check");
  if (summary.accessoriesMissing) kinds.push("missing_accessory");
  const severe = summary.damage || summary.notOperating.length > 0;
  return {
    id: row.id,
    reference: submissionReference(row.id, row.created_at),
    createdAt: row.created_at,
    statusLabel: STATUS_LABELS[row.status] ?? "Unknown",
    open: isUnresolvedStatus(row.status),
    status: digestStatus(row.status),
    source,
    sourceLabel: source === "staff" ? "Staff" : "Renter",
    assetId: row.asset_id ?? null,
    assetCode: cleanText(asset?.asset_code, LABEL_LIMIT),
    assetName: cleanText(asset?.asset_name, LABEL_LIMIT),
    rentalSessionId: typeof row.rental_session_id === "string" ? row.rental_session_id : null,
    group: severe ? 1 : 2,
    issueClass: severe ? 1 : summary.failedRequired.length > 0 ? 2 : 3,
    kinds,
    exceptionCount,
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

// ---------------------------------------------------------------------------
// D5.1 presentation: counters, asset grouping, display cap
// ---------------------------------------------------------------------------

export type DigestCounters = {
  total: number;
  open: number;
  newCount: number;
  reviewed: number;
  handled: number;
  damageOrNotOperating: number;
  failedChecks: number;
  missingAccessories: number;
};

/** Counts over every summarized return. Each return is counted once, under its most serious issue. */
export function digestCounters(items: DigestItem[]): DigestCounters {
  const counters: DigestCounters = {
    total: items.length,
    open: 0,
    newCount: 0,
    reviewed: 0,
    handled: 0,
    damageOrNotOperating: 0,
    failedChecks: 0,
    missingAccessories: 0,
  };
  for (const item of items) {
    if (item.open) counters.open++;
    else counters.handled++;
    if (item.status === "new") counters.newCount++;
    if (item.status === "reviewed") counters.reviewed++;
    if (item.issueClass === 1) counters.damageOrNotOperating++;
    else if (item.issueClass === 2) counters.failedChecks++;
    else counters.missingAccessories++;
  }
  return counters;
}

export type DigestSectionKey = "damage_or_not_operating" | "failed_checks" | "missing_accessories" | "handled";

export const DIGEST_SECTION_TITLES: Record<DigestSectionKey, string> = {
  damage_or_not_operating: "Damage or does not operate",
  failed_checks: "Failed condition checks",
  missing_accessories: "Missing accessories",
  handled: "Resolved or archived",
};

const SECTION_ORDER: DigestSectionKey[] = ["damage_or_not_operating", "failed_checks", "missing_accessories", "handled"];

export type DigestAssetGroup = {
  key: string;
  assetCode: string | null;
  assetName: string | null;
  /** Every displayed return for this asset, open first. */
  items: DigestItem[];
  openCount: number;
  exceptionCount: number;
  /** The most serious class among the open returns; null when every return is resolved or archived. */
  leadClass: 1 | 2 | 3 | null;
  /** Item id → the reference of an earlier-listed return from the same rental session. */
  sameSession: Record<string, string>;
  /** Returns of this asset not displayed because of the cap. */
  hiddenItems: number;
};

export type DigestSection = { key: DigestSectionKey; title: string; groups: DigestAssetGroup[]; itemCount: number };

const STATUS_RANK: Record<DigestStatus, number> = { new: 0, reviewed: 1, resolved: 2, archived: 3, unknown: 4 };

function compareItems(a: DigestItem, b: DigestItem): number {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    a.issueClass - b.issueClass ||
    timeOf(a.createdAt) - timeOf(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

function oldest(items: DigestItem[]): number {
  return items.reduce((min, item) => Math.min(min, timeOf(item.createdAt)), Number.POSITIVE_INFINITY);
}

function compareCodes(a: DigestAssetGroup, b: DigestAssetGroup): number {
  if (a.assetCode === b.assetCode) return 0;
  if (a.assetCode === null) return 1;
  if (b.assetCode === null) return -1;
  return a.assetCode.localeCompare(b.assetCode, "en");
}

function leadItems(group: DigestAssetGroup): DigestItem[] {
  return group.items.filter((item) => item.open && item.issueClass === group.leadClass);
}

function compareOpenGroups(a: DigestAssetGroup, b: DigestAssetGroup): number {
  const leadA = leadItems(a);
  const leadB = leadItems(b);
  const newA = leadA.some((item) => item.status === "new") ? 0 : 1;
  const newB = leadB.some((item) => item.status === "new") ? 0 : 1;
  return newA - newB || oldest(leadA) - oldest(leadB) || compareCodes(a, b) || a.key.localeCompare(b.key);
}

function compareHandledGroups(a: DigestAssetGroup, b: DigestAssetGroup): number {
  return oldest(a.items) - oldest(b.items) || compareCodes(a, b) || a.key.localeCompare(b.key);
}

function sectionFor(leadClass: DigestAssetGroup["leadClass"]): DigestSectionKey {
  if (leadClass === 1) return "damage_or_not_operating";
  if (leadClass === 2) return "failed_checks";
  if (leadClass === 3) return "missing_accessories";
  return "handled";
}

/**
 * One card per asset holding every summarized return for it (a return without an asset is its own card). A card sits
 * in the section of its most serious OPEN return; a card with no open return goes to "Resolved or archived", so an asset
 * appears exactly once. Empty sections are omitted.
 */
export function groupDigestItems(items: DigestItem[]): DigestSection[] {
  const byKey = new Map<string, DigestItem[]>();
  for (const item of items) {
    const key = item.assetId ? `asset:${item.assetId}` : `item:${item.id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }

  const groups: DigestAssetGroup[] = [...byKey.entries()].map(([key, list]) => {
    const sorted = [...list].sort(compareItems);
    const open = sorted.filter((item) => item.open);
    const sameSession: Record<string, string> = {};
    sorted.forEach((item, index) => {
      if (!item.rentalSessionId) return;
      const earlier = sorted.slice(0, index).find((other) => other.rentalSessionId === item.rentalSessionId);
      if (earlier) sameSession[item.id] = earlier.reference;
    });
    return {
      key,
      assetCode: sorted[0].assetCode,
      assetName: sorted[0].assetName,
      items: sorted,
      openCount: open.length,
      exceptionCount: sorted.reduce((sum, item) => sum + item.exceptionCount, 0),
      leadClass: open.length > 0 ? (Math.min(...open.map((item) => item.issueClass)) as 1 | 2 | 3) : null,
      sameSession,
      hiddenItems: 0,
    };
  });

  return SECTION_ORDER.map((key) => {
    const inSection = groups
      .filter((group) => sectionFor(group.leadClass) === key)
      .sort(key === "handled" ? compareHandledGroups : compareOpenGroups);
    return {
      key,
      title: DIGEST_SECTION_TITLES[key],
      groups: inSection,
      itemCount: inSection.reduce((sum, group) => sum + group.items.length, 0),
    };
  }).filter((section) => section.groups.length > 0);
}

export type DigestLimitResult = {
  sections: DigestSection[];
  shownRows: number;
  shownGroups: number;
  totalRows: number;
  totalGroups: number;
};

/**
 * Bound what the email displays. Whole cards are taken in order while both caps allow; the walk stops at the first card
 * that does not fit, so the order keeps its meaning. A first card larger than the row cap is shown partially.
 */
export function limitDigestSections(
  sections: DigestSection[],
  caps: { maxRows: number; maxGroups: number }
): DigestLimitResult {
  const totalRows = sections.reduce((sum, section) => sum + section.itemCount, 0);
  const totalGroups = sections.reduce((sum, section) => sum + section.groups.length, 0);
  const shown: DigestSection[] = [];
  let shownRows = 0;
  let shownGroups = 0;
  let stopped = false;

  for (const section of sections) {
    const groups: DigestAssetGroup[] = [];
    for (const group of section.groups) {
      if (shownGroups >= caps.maxGroups) {
        stopped = true;
        break;
      }
      if (shownRows + group.items.length <= caps.maxRows) {
        groups.push(group);
        shownRows += group.items.length;
        shownGroups++;
        continue;
      }
      if (shownGroups === 0) {
        const visible = group.items.slice(0, caps.maxRows);
        groups.push({ ...group, items: visible, hiddenItems: group.items.length - visible.length });
        shownRows += visible.length;
        shownGroups++;
      }
      stopped = true;
      break;
    }
    if (groups.length > 0) {
      shown.push({ ...section, groups, itemCount: groups.reduce((sum, group) => sum + group.items.length, 0) });
    }
    if (stopped) break;
  }

  return { sections: shown, shownRows, shownGroups, totalRows, totalGroups };
}
