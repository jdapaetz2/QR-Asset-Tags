/**
 * Pure organization-status helpers (account-level suspension, Wave 5E.1).
 *
 * `organizations.status` is `active` | `suspended` (0001 CHECK). Suspension is an
 * owner-controlled, data-preserving pause: customer users lose access and public pages
 * go unavailable, but nothing is deleted. These helpers hold the shared vocabulary +
 * the access decision so it is unit-tested and reused by the guard, the owner action,
 * and the UI. No I/O.
 */

import { ROLES } from "@/lib/auth/roles";

export const ORG_STATUSES = ["active", "suspended"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export function isOrgStatus(value: unknown): value is OrgStatus {
  return (
    typeof value === "string" && (ORG_STATUSES as readonly string[]).includes(value)
  );
}

/** True only for the exact `active` status. Unknown/blank → treated as not active. */
export function isOrgActive(status: string | null | undefined): boolean {
  return status === "active";
}

// Human-readable labels live in `lib/ui/status-labels.ts` (`orgStatusLabel`) — the single
// source of truth for wording. This module holds only status logic, not presentation.

export type OrgStatusResult =
  | { value: OrgStatus; error?: undefined }
  | { value?: undefined; error: string };

/** Validate a raw status input (e.g. from a form) into an allowed value. */
export function validateOrgStatus(raw: string | null | undefined): OrgStatusResult {
  const trimmed = (raw ?? "").trim();
  if (!isOrgStatus(trimmed)) {
    return { error: "Status must be active or suspended." };
  }
  return { value: trimmed };
}

/**
 * Whether a signed-in user may use customer app surfaces given their org's active state.
 * Platform owners are never gated by a customer org's status; customer roles require an
 * active org. Mirrors the RLS rule in migration 0019 (current_org_id() gates on org active).
 */
export function orgAccessAllowed(params: {
  role: string;
  orgActive: boolean;
}): boolean {
  if (params.role === ROLES.PLATFORM_OWNER) return true;
  return params.orgActive;
}
