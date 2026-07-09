/**
 * Shared asset status view-model (A2). Pure, derives ONLY from existing schema — no new
 * fields, no persisted state. It's the typed *display* layer for admin status columns:
 * one rental state, one readiness verdict (with a single primary reason + the full list),
 * and one visibility value. The readiness conditions mirror `assetReadiness`
 * (`lib/qr/production.ts`) exactly — that helper stays the canonical producer for CSV/sheet/
 * analytics/tag-request data; this one adds typed reason codes for the UI. A test asserts the
 * two agree on `ready`.
 *
 * Design rule (product-design-system): one rental badge + one readiness indicator + a lock for
 * private — never a badge pile.
 */

export type RentalState = "available" | "rented" | "unknown";

export type ReadinessReason =
  | "org_inactive"
  | "missing_qr"
  | "qr_inactive"
  | "page_missing"
  | "page_draft"
  | "asset_private";

export type AssetVisibility = "public" | "private" | "archived";

export type AssetStatusView = {
  rentalState: RentalState;
  readiness: { ready: boolean; reason: ReadinessReason | null; reasons: ReadinessReason[] };
  visibility: AssetVisibility;
};

export type AssetStatusInput = {
  /** Whether an active rental session is open. */
  rented: boolean;
  /** `assets.public_status`. */
  publicStatus: string;
  /** Active QR link → "active"; a link that isn't active → "disabled"; no link → null. */
  qrStatus: "active" | "disabled" | null;
  pageStatus: "published" | "draft" | "missing";
  /** `assets.archived_at` — presence means archived. */
  archivedAt?: string | null;
  /**
   * Optional owning-org active flag. Only when explicitly `false` does `org_inactive` apply;
   * left undefined on surfaces where the org is active by construction (customer dashboard).
   */
  orgActive?: boolean;
};

const REASON_LABELS: Record<ReadinessReason, string> = {
  org_inactive: "Org suspended",
  missing_qr: "No QR",
  qr_inactive: "QR inactive",
  page_missing: "No page",
  page_draft: "Page draft",
  asset_private: "Private",
};

/** Human label for a readiness reason. */
export function readinessReasonLabel(reason: ReadinessReason): string {
  return REASON_LABELS[reason];
}

/**
 * Derive the display status. Readiness reasons are collected in priority order; `reason` is the
 * first (most fundamental) blocker. `asset_private` is last so a QR/page blocker shows in the
 * readiness chip while the lock icon carries privacy. An asset is `ready` only when it is fully
 * public + active QR + published page (matching `assetReadiness`).
 */
export function deriveAssetStatus(input: AssetStatusInput): AssetStatusView {
  const reasons: ReadinessReason[] = [];

  if (input.orgActive === false) reasons.push("org_inactive");

  if (input.qrStatus === null) reasons.push("missing_qr");
  else if (input.qrStatus !== "active") reasons.push("qr_inactive");

  if (input.pageStatus === "missing") reasons.push("page_missing");
  else if (input.pageStatus !== "published") reasons.push("page_draft");

  if (input.publicStatus !== "public") reasons.push("asset_private");

  const visibility: AssetVisibility = input.archivedAt
    ? "archived"
    : input.publicStatus === "public"
      ? "public"
      : "private";

  return {
    rentalState: input.rented ? "rented" : "available",
    readiness: { ready: reasons.length === 0, reason: reasons[0] ?? null, reasons },
    visibility,
  };
}
