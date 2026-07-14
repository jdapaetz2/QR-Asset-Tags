/**
 * Pure helpers for the outbound-vs-rental-session interaction (Phase 3C.6). No I/O — drive the outbound route's
 * three-case branch and map the `start_outbound_rental` RPC result codes to user outcomes.
 */

/** Which outbound flow applies given the asset's current session state. */
export type OutboundSessionMode = "create" | "attach" | "blocked";

/**
 * - `create`  — no active session: completing the outbound creates the session + marks the asset rented.
 * - `attach`  — active session, no baseline yet: the outbound attaches to it (staff must confirm first).
 * - `blocked` — active session that already has an outbound baseline: don't create a second one.
 */
export function outboundSessionMode(input: {
  activeSessionId: string | null | undefined;
  hasBaseline: boolean;
}): OutboundSessionMode {
  if (!input.activeSessionId) return "create";
  return input.hasBaseline ? "blocked" : "attach";
}

export type OutboundResultCode =
  | "session_created"
  | "attached_to_existing_session"
  | "baseline_already_exists"
  | "session_conflict"
  | "not_found"
  | "forbidden";

/** The `?started=` vs `?attached=` redirect flag for a successful outbound (raw RPC text). */
export function outboundSuccessFlag(code: string): "started" | "attached" | null {
  if (code === "session_created") return "started";
  if (code === "attached_to_existing_session") return "attached";
  return null;
}

/** Human error for a non-success result code (surfaced inline on the outbound form). */
export function outboundResultError(code: string): string {
  switch (code) {
    case "baseline_already_exists":
      return "An outbound inspection is already recorded for this rental session.";
    case "session_conflict":
      return "This asset's rental changed. Reload the page and try again.";
    case "not_found":
    case "forbidden":
      return "Asset not found.";
    default:
      return "Could not complete the outbound inspection. Please try again.";
  }
}
