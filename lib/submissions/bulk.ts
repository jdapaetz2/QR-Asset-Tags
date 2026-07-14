/**
 * Pure helpers for bulk submission triage (Phase 3C.4). Selection + the server mutation live elsewhere; this
 * file holds the safety partition and the result copy so both are unit-testable without a database.
 */
import { isLikelyUuid } from "@/lib/rentals/evidence";

/** Hard cap on ids per bulk action — a backstop against a runaway request, not a product limit. */
export const BULK_MAX = 100;

export type BulkResolveRow = {
  id: string;
  form_type: string;
  submission_origin: string | null;
  status: string;
  asset_id: string | null;
};

/**
 * Validate + cap a client-supplied id list: keep only well-formed UUIDs, at most {@link BULK_MAX}. Anything
 * dropped is counted in `rejected` (malformed ids or over-cap overflow). The server derives the real org scope
 * via RLS, so this is only shape/size hygiene — never a trust boundary.
 */
export function limitBulkIds(ids: string[]): { ids: string[]; rejected: number } {
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const id of ids) {
    if (isLikelyUuid(id) && !seen.has(id)) {
      seen.add(id);
      valid.push(id);
    }
  }
  const capped = valid.slice(0, BULK_MAX);
  return { ids: capped, rejected: ids.length - capped.length };
}

/**
 * Partition selected rows for a bulk RESOLVE. A public/renter return checklist that is still unresolved
 * (new/reviewed) while its asset still has an active rental must NOT be resolved here — that would bypass the
 * physical-return workflow. Those are skipped; the operator uses "Mark returned & resolve" for each. Staff
 * returns already completed the physical return, so they resolve normally; damage/support resolve normally.
 */
export function partitionBulkResolve(
  rows: BulkResolveRow[],
  activeAssetIds: Set<string>
): { eligibleIds: string[]; skippedActiveRenterReturn: string[] } {
  const eligibleIds: string[] = [];
  const skipped: string[] = [];
  for (const r of rows) {
    const isRenterReturn = r.form_type === "return_checklist" && r.submission_origin !== "staff";
    const unresolved = r.status === "new" || r.status === "reviewed";
    const stillRented = r.asset_id ? activeAssetIds.has(r.asset_id) : false;
    if (isRenterReturn && unresolved && stillRented) skipped.push(r.id);
    else eligibleIds.push(r.id);
  }
  return { eligibleIds, skippedActiveRenterReturn: skipped };
}

const VERB: Record<string, string> = {
  reviewed: "marked reviewed",
  resolved: "resolved",
  archived: "archived",
  new: "reopened",
};

/** Inline banner copy: what changed, plus the renter-return skip reason when any were held back. */
export function bulkResultMessage(input: {
  targetStatus: string;
  updated: number;
  skipped: number;
}): string {
  const { targetStatus, updated, skipped } = input;
  const verb = VERB[targetStatus] ?? "updated";
  const main = `${updated} submission${updated === 1 ? "" : "s"} ${verb}.`;
  if (skipped > 0) {
    return `${main} ${skipped} renter return${skipped === 1 ? " was" : "s were"} skipped because ${
      skipped === 1 ? "its" : "their"
    } rental is still active.`;
  }
  return main;
}
