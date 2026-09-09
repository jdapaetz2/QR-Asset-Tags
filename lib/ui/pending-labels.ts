/**
 * Action-specific pending wording (Phase C8).
 *
 * WHY THESE ARE PURE AND CENTRAL. The submissions status buttons already disabled themselves on click —
 * measured at **57 ms**, comfortably inside the 100 ms budget — but every button greyed out at once with
 * no indication of *which* action was running. That is the difference between "something is happening"
 * and "the thing I clicked is happening", and it is the whole of the perceived-inertness complaint on
 * that surface. Keeping the wording here makes it testable and keeps the same verb in the single and
 * bulk paths, so "Resolve" never becomes "Resolving…" in one place and "Working…" in another.
 *
 * TRUTHFULNESS RULE, and it is the reason this module is not just a lookup table: every label below is
 * **present continuous — an action in progress, never a completed one**. Nothing here may ever read
 * "Resolved" or "Archived", because the server has not answered yet and the row is not yet in that
 * state. A pending label that states the outcome is a false optimistic success wearing a spinner.
 */

/** The submission statuses an operator can move a row to. Mirrors lib/submissions/status-actions.ts. */
export type PendingStatus = "new" | "reviewed" | "resolved" | "archived";

const STATUS_PENDING: Record<PendingStatus, string> = {
  new: "Reopening…",
  reviewed: "Marking reviewed…",
  resolved: "Resolving…",
  archived: "Archiving…",
};

function isPendingStatus(value: string): value is PendingStatus {
  return value === "new" || value === "reviewed" || value === "resolved" || value === "archived";
}

/**
 * Pending wording for a single status change, or null when the target is not one we recognise.
 *
 * Null rather than a guess: an unrecognised target means the caller and this module have drifted, and
 * inventing "Working…" would hide that. The caller falls back to its idle label, which is still true.
 */
export function statusPendingLabel(status: string): string | null {
  return isPendingStatus(status) ? STATUS_PENDING[status] : null;
}

/**
 * Pending wording for a BULK status change, counted so the operator can see the scope of what they
 * started — "Resolving 12…" is materially more reassuring than "Working…" when the list is long.
 */
export function bulkPendingLabel(status: string, count: number): string {
  const n = Math.max(0, count);
  if (!isPendingStatus(status)) return "Working…";
  const verb = {
    new: "Reopening",
    reviewed: "Marking reviewed",
    resolved: "Resolving",
    archived: "Archiving",
  }[status];
  return `${verb} ${n} submission${n === 1 ? "" : "s"}…`;
}

/** Sign-in wording. The two modes do genuinely different things, so they do not share a label. */
export function loginPendingLabel(mode: "magic" | "password"): string {
  return mode === "magic" ? "Sending link…" : "Signing in…";
}
