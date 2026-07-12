/**
 * Pure helpers for the "Mark returned & resolve" quick action (return checklists).
 *
 * No I/O here — the atomic work is the `mark_return_and_resolve` RPC (migration 0022).
 * These decide when the button is offered, derive the damage/missing flags from a return
 * checklist's `submission_data_json`, and map the RPC's text result code to a user message.
 */
import { isUnresolvedStatus } from "@/lib/submissions/inbox";

/** The quick action applies only to an unresolved (new/reviewed) return checklist. */
export function canQuickResolveReturn(input: {
  formType: string;
  status: string;
}): boolean {
  return (
    input.formType === "return_checklist" && isUnresolvedStatus(input.status)
  );
}

/**
 * Whether a return checklist reports damage or missing items, read from the untyped
 * `submission_data_json`. Keys are `damage_observed` / `accessories_returned` with
 * "yes" | "no" | null values; anything that isn't the exact string is treated as absent.
 */
export function returnChecklistFlags(data: unknown): {
  damage: boolean;
  missing: boolean;
  flagged: boolean;
} {
  const obj =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const damage = obj.damage_observed === "yes";
  const missing = obj.accessories_returned === "no";
  return { damage, missing, flagged: damage || missing };
}

export type ReturnActionOutcome =
  | { ok: true; done: "returned" | "already"; message: string }
  | { ok: false; error: string };

/** Map the RPC's text result code to an action outcome (redirect flag + message). */
export function returnActionOutcome(code: string): ReturnActionOutcome {
  switch (code) {
    case "returned":
      return {
        ok: true,
        done: "returned",
        message: "Asset marked returned and checklist resolved.",
      };
    case "resolved_only":
    case "already_resolved":
      return {
        ok: true,
        done: "already",
        message: "Checklist resolved. Asset was already available.",
      };
    case "not_return":
      return { ok: false, error: "This action only applies to return checklists." };
    default:
      return { ok: false, error: "Submission not found." };
  }
}

/** Message for the post-action banner, keyed by the redirect `?done=` flag. */
export function returnDoneMessage(done: string | null | undefined): string | null {
  if (done === "returned") return "Asset marked returned and checklist resolved.";
  if (done === "already") return "Checklist resolved. Asset was already available.";
  return null;
}
