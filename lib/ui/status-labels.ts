/**
 * Canonical human-readable labels for the app's states. Single source of truth so
 * wording stays consistent across dashboard, owner, and admin surfaces. Text only —
 * visual tone lives in `lib/ui/status.ts`, which this file does not change.
 */

import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewed: "Reviewed",
  resolved: "Resolved",
  archived: "Archived",
};

/** Submission workflow state → New / Reviewed / Resolved / Archived. */
export function submissionStatusLabel(status: string): string {
  return SUBMISSION_STATUS_LABELS[status] ?? capitalize(status);
}

const ORG_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
};

/** Organization account state → Active / Suspended (capitalized fallback). */
export function orgStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return ORG_STATUS_LABELS[status] ?? capitalize(status);
}

/** Data-export toggle state → Enabled / Disabled. */
export function exportStateLabel(enabled: boolean): string {
  return enabled ? "Enabled" : "Disabled";
}

/** Asset public visibility → Public / Private. */
export function assetVisibilityLabel(publicStatus: string): string {
  return publicStatus === "public" ? "Public" : "Private";
}

/** Rental state → Rented (session open) / Available. */
export function rentalStateLabel(rented: boolean): string {
  return rented ? "Rented" : "Available";
}

/** Equipment page state → Page live / Page draft / No page. */
export function pageStateLabel(
  pageStatus: "published" | "draft" | "missing"
): string {
  switch (pageStatus) {
    case "published":
      return "Page live";
    case "draft":
      return "Page draft";
    default:
      return "No page";
  }
}

/** QR state → QR ready (active link) / QR inactive (link, not active) / No QR. */
export function qrStateLabel(hasQr: boolean, hasActiveQr: boolean): string {
  if (hasActiveQr) return "QR ready";
  return hasQr ? "QR inactive" : "No QR";
}

// Re-export so callers get every status label from one module.
export { tagRequestStatusLabel };
