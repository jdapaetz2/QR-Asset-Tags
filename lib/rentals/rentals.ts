/**
 * Pure helpers for lightweight rental sessions + the public acknowledgement prompt.
 * No I/O and no `organization_id` handling — the server actions derive org from the
 * profile and RLS scopes the rows. A rental session is an operational state, NOT a
 * booking/contract.
 */

export const RENTAL_STATUSES = ["active", "returned", "cancelled"] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export function isRentalStatus(value: unknown): value is RentalStatus {
  return (
    typeof value === "string" &&
    (RENTAL_STATUSES as readonly string[]).includes(value)
  );
}

/** Statuses that close an active session. */
export function isCloseStatus(value: unknown): value is "returned" | "cancelled" {
  return value === "returned" || value === "cancelled";
}

const MAX_LEN = 120;

export type RentalStartInput = {
  rental_reference: string | null;
  renter_label: string | null;
};

function clean(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_LEN);
  return trimmed.length === 0 ? null : trimmed;
}

/** Normalize the optional rental reference + renter label (both may be empty). */
export function normalizeRentalStart(
  raw: Record<string, string | undefined>
): RentalStartInput {
  return {
    rental_reference: clean(raw.rental_reference),
    renter_label: clean(raw.renter_label),
  };
}

/** Whether the public acknowledgement prompt should appear for this device/session. */
export function shouldShowAckPrompt(input: {
  hasActiveSession: boolean;
  alreadyHandled: boolean;
}): boolean {
  return input.hasActiveSession && !input.alreadyHandled;
}

/**
 * localStorage key that suppresses repeat prompts on this device for one asset +
 * rental session. A new session produces a new key, so the prompt can appear again.
 */
export function ackPromptStorageKey(assetId: string, sessionId: string): string {
  return `ackPrompt:${assetId}:${sessionId}`;
}

/**
 * localStorage key that records the FIRST Quick Start view for one asset + rental
 * session on this device. Distinct namespace from the ack key (never touch that one);
 * a new session id yields a new key, so Quick Start can auto-expand again for the next
 * rental.
 */
export function quickStartStorageKey(assetId: string, sessionId: string): string {
  return `mulemark:quick-start-seen:${assetId}:${sessionId}`;
}

/**
 * Whether Quick Start should auto-expand: only on the first scan of an active rental
 * session on this device (active session AND not yet seen). No active session, or an
 * already-seen session, stays collapsed (still manually expandable).
 */
export function shouldAutoExpandQuickStart(input: {
  hasActiveSession: boolean;
  alreadySeen: boolean;
}): boolean {
  return input.hasActiveSession && !input.alreadySeen;
}
