/**
 * Pure staff outbound/return workflow state (Phase 3C.7). Derives which action card the staff asset
 * page shows from the ACTUAL active-session + baseline data — never inferred from the asset's rental
 * status flag alone. This replaces the legacy "a new outbound session cannot start until it is
 * returned" notice: an active rental with no outbound baseline can now have one added (Phase 3C.6).
 *
 * - `available` : no active rental session → offer "Start outbound inspection".
 * - `attach`    : active session, no outbound baseline → offer "Add outbound inspection".
 * - `recorded`  : active session WITH an outbound baseline → view-only (never Start/Add).
 * - `error`     : rented, but the active session row could not be loaded → safe attention state.
 */
export type StaffOutboundState = "available" | "attach" | "recorded" | "error";

export function staffOutboundState(input: {
  rented: boolean;
  sessionLoaded: boolean;
  hasBaseline: boolean;
}): StaffOutboundState {
  if (!input.rented) return "available";
  if (!input.sessionLoaded) return "error";
  return input.hasBaseline ? "recorded" : "attach";
}
