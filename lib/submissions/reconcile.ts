/**
 * Pure reconciliation decision for a same-session renter return report when the STAFF return completes
 * (Phase 3B). No I/O. This mirrors the UPDATE inside the `complete_staff_return` RPC (migration 0029) so
 * the behavior is unit-covered; the RPC is the transactional source of truth.
 *
 * Rules (Part E):
 *   - Only new/reviewed renter reports are ever touched (resolved/archived are left exactly as-is).
 *   - A clean staff return AND a clean renter report → the renter report is auto-resolved.
 *   - Otherwise (damage/missing on either side, or a discrepancy) → mark reviewed AT MOST — never resolved,
 *     so the item keeps dashboard attention for a manager. Idempotent (reviewed stays reviewed).
 *
 * The staff return's own status is decided separately (`staffReturnStatus`) and is not changed here; a
 * flagged staff return stays `new`.
 */
import type { SubmissionStatus } from "@/lib/submissions/display";

export function reconcileRenterStatus(input: {
  staffClean: boolean;
  renterClean: boolean;
  current: string;
}): SubmissionStatus | string {
  // Never reopen/re-close a resolved or archived report, and never touch an unknown status.
  if (input.current !== "new" && input.current !== "reviewed") return input.current;
  if (input.staffClean && input.renterClean) return "resolved";
  return "reviewed";
}
