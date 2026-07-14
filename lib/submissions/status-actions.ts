/**
 * Direct submission status transitions (Phase 3C.4). Replaces the status <select> dropdown with explicit,
 * state-aware action buttons on the submission detail page. Pure + unit-tested; the button component + the
 * server action consume this.
 *
 * Rules: the current status is never offered (you can't set the state you're already in); reopen/restore are
 * worded explicitly; `resolve` from a renter return with an active rental is filtered out at the call site
 * (that path must use "Mark returned & resolve", never an ordinary Resolve).
 */
import type { SubmissionStatus } from "@/lib/submissions/display";

export type StatusAction = {
  /** Target status the button sets. */
  status: SubmissionStatus;
  /** Button label. */
  label: string;
  /** `danger`/reopen styling hints for the component; archive additionally confirms. */
  tone: "default" | "reopen" | "archive";
};

const ACTIONS_BY_STATUS: Record<SubmissionStatus, StatusAction[]> = {
  new: [
    { status: "reviewed", label: "Mark reviewed", tone: "default" },
    { status: "resolved", label: "Resolve", tone: "default" },
    { status: "archived", label: "Archive", tone: "archive" },
  ],
  reviewed: [
    { status: "new", label: "Reopen as new", tone: "reopen" },
    { status: "resolved", label: "Resolve", tone: "default" },
    { status: "archived", label: "Archive", tone: "archive" },
  ],
  resolved: [
    { status: "reviewed", label: "Reopen as reviewed", tone: "reopen" },
    { status: "archived", label: "Archive", tone: "archive" },
  ],
  archived: [{ status: "reviewed", label: "Restore as reviewed", tone: "reopen" }],
};

/**
 * The direct actions available from a given status. When `hideResolve` is true (an unresolved renter return
 * whose rental is still active), the ordinary Resolve button is omitted — the caller renders
 * "Mark returned & resolve" instead so the physical return is never bypassed.
 */
export function nextStatusActions(
  status: string,
  opts: { hideResolve?: boolean } = {}
): StatusAction[] {
  const list = ACTIONS_BY_STATUS[status as SubmissionStatus] ?? [];
  return opts.hideResolve ? list.filter((a) => a.status !== "resolved") : list;
}
