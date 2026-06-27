/**
 * Pure helpers for the asset index: query-param parsing/validation, search
 * sanitization, per-asset status, and permanent-delete eligibility. No I/O — the
 * page builds the RLS-scoped query from these normalized values and applies the
 * QR/page predicates in JS.
 */

export const PUBLIC_STATUS_FILTERS = ["all", "public", "private"] as const;
export const QR_FILTERS = ["all", "has", "missing"] as const;
export const PAGE_FILTERS = ["all", "published", "draft", "missing"] as const;
export const LIFECYCLE_FILTERS = ["active", "archived", "all"] as const;
export const RENTAL_FILTERS = ["all", "rented", "available"] as const;
export const ASSET_SORTS = [
  "asset_code",
  "asset_name",
  "created_at",
  "category",
] as const;

export type PublicStatusFilter = (typeof PUBLIC_STATUS_FILTERS)[number];
export type QrFilter = (typeof QR_FILTERS)[number];
export type PageFilter = (typeof PAGE_FILTERS)[number];
export type LifecycleFilter = (typeof LIFECYCLE_FILTERS)[number];
export type RentalFilter = (typeof RENTAL_FILTERS)[number];
export type AssetSort = (typeof ASSET_SORTS)[number];
export type AssetPageStatus = "published" | "draft" | "missing";

export type AssetListParams = {
  q: string;
  publicStatus: PublicStatusFilter;
  category: string;
  qr: QrFilter;
  page: PageFilter;
  lifecycle: LifecycleFilter;
  rental: RentalFilter;
  sort: AssetSort;
};

function firstString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function oneOf<T extends readonly string[]>(
  value: string,
  allowed: T,
  fallback: T[number]
): T[number] {
  return (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

/** Normalize raw searchParams into safe, validated list params. */
export function parseAssetListParams(
  sp: Record<string, string | string[] | undefined>
): AssetListParams {
  return {
    q: firstString(sp.q).trim(),
    publicStatus: oneOf(firstString(sp.status), PUBLIC_STATUS_FILTERS, "all"),
    category: firstString(sp.category).trim(),
    qr: oneOf(firstString(sp.qr), QR_FILTERS, "all"),
    page: oneOf(firstString(sp.page), PAGE_FILTERS, "all"),
    lifecycle: oneOf(firstString(sp.lifecycle), LIFECYCLE_FILTERS, "active"),
    rental: oneOf(firstString(sp.rental), RENTAL_FILTERS, "all"),
    sort: oneOf(firstString(sp.sort), ASSET_SORTS, "asset_code"),
  };
}

/**
 * Strip characters that would break a PostgREST `or(...)` filter string so a free
 * text search can be interpolated into `.or("col.ilike.%q%,...")` safely.
 */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*\\%]/g, " ").trim().slice(0, 80);
}

export function assetPageStatus(
  hasPage: boolean,
  isPublished: boolean
): AssetPageStatus {
  if (!hasPage) return "missing";
  return isPublished ? "published" : "draft";
}

export function matchesQrFilter(filter: QrFilter, hasQr: boolean): boolean {
  if (filter === "has") return hasQr;
  if (filter === "missing") return !hasQr;
  return true;
}

export function matchesPageFilter(
  filter: PageFilter,
  status: AssetPageStatus
): boolean {
  return filter === "all" ? true : filter === status;
}

export function matchesRentalFilter(
  filter: RentalFilter,
  hasActiveSession: boolean
): boolean {
  if (filter === "rented") return hasActiveSession;
  if (filter === "available") return !hasActiveSession;
  return true;
}

export type DeleteDeps = {
  qr: number;
  scans: number;
  submissions: number;
  documents: number;
  page: number;
};

export type DeleteEligibility = { canDelete: boolean; reason?: string };

/**
 * Permanent delete is allowed ONLY when an asset has no dependent history. Any
 * QR link, scan, submission, document, or equipment page means "archive instead".
 */
export function deleteEligibility(deps: DeleteDeps): DeleteEligibility {
  const blockers: string[] = [];
  if (deps.qr > 0) blockers.push("QR links");
  if (deps.scans > 0) blockers.push("scan history");
  if (deps.submissions > 0) blockers.push("submissions");
  if (deps.documents > 0) blockers.push("documents");
  if (deps.page > 0) blockers.push("an equipment page");
  if (blockers.length === 0) return { canDelete: true };
  return {
    canDelete: false,
    reason: `This asset has ${blockers.join(", ")}. Archive it instead to keep its history.`,
  };
}
