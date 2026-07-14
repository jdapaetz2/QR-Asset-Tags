/**
 * Accessory value normalization (Phase 3C.5). Return inspections store `returned`/`missing`/`na`; outbound
 * (pre-use) inspections store `issued`/`not_issued`/`na`. This module maps either vocabulary to a neutral
 * presence (for comparison) and to a context-appropriate display label (for the admin summary + evidence),
 * including LEGACY outbound rows that were stored with return semantics before this change. Pure — no I/O, no
 * historical rewrite.
 */

export type AccessoryPresence = "present" | "absent" | "na";

/** Neutral presence for comparison: an accessory that was returned OR issued is "present"; missing/not_issued absent. */
export function accessoryPresence(value: string | null | undefined): AccessoryPresence {
  switch (value) {
    case "returned":
    case "issued":
      return "present";
    case "missing":
    case "not_issued":
      return "absent";
    default:
      return "na";
  }
}

/**
 * Context-appropriate display label. For an OUTBOUND inspection a present accessory reads "Issued" and an absent
 * one "Not issued" — so a legacy outbound row stored as `returned`/`missing` displays correctly as Issued/Not
 * issued without touching the stored JSON. For a RETURN inspection it reads Returned/Missing.
 */
export function accessoryLabel(
  value: string | null | undefined,
  inspectionType: string | null | undefined
): string {
  const presence = accessoryPresence(value);
  if (presence === "na") return value == null || value === "" ? "—" : "N/A";
  const outbound = inspectionType === "outbound";
  if (presence === "present") return outbound ? "Issued" : "Returned";
  return outbound ? "Not issued" : "Missing";
}
