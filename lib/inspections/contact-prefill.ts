/**
 * Pure gating for authenticated contact prefill on the PUBLIC renter return inspection (Phase 3C.8).
 *
 * A signed-in SAME-ORGANIZATION admin/staff member filling in the public renter return form gets their
 * account name + email pre-filled in the optional contact section as a convenience. This is decided here so
 * the rule is testable and can't leak across organizations. The public route derives the values server-side
 * and passes them as form defaults — no extra client request, fields stay editable, user edits win.
 *
 * Security rules (all must hold, else `null` → blank fields):
 *  - the viewer is authenticated with an active profile (the caller already resolves `getProfile()`, which
 *    returns null for unauthenticated/disabled users),
 *  - the viewer belongs to the SAME organization as the scanned asset,
 *  - the role is `customer_admin` or `customer_staff`.
 *
 * A platform owner is NOT prefilled into another organization's renter form merely because they can access the
 * platform: their `organization_id` won't equal the asset's org, so the same-org check fails. Phone is never
 * supplied — the profile has no personal phone column (do not substitute the org support phone).
 */

import { ROLES, type Role } from "@/lib/auth/roles";

export type PrefillProfile = {
  organization_id: string | null;
  name: string | null;
  email: string | null;
  role: Role;
};

export type ContactPrefill = { name: string | null; email: string | null };

const PREFILL_ROLES: readonly Role[] = [ROLES.CUSTOMER_ADMIN, ROLES.CUSTOMER_STAFF];

export function resolveContactPrefill(
  profile: PrefillProfile | null | undefined,
  assetOrganizationId: string | null | undefined
): ContactPrefill | null {
  if (!profile) return null;
  if (!assetOrganizationId) return null;
  if (!profile.organization_id) return null;
  if (profile.organization_id !== assetOrganizationId) return null; // cross-org (incl. platform owner) → no prefill
  if (!PREFILL_ROLES.includes(profile.role)) return null;

  // Email is the reliable signal (auth-backed); name may be null. Phone has no source → always blank.
  return { name: profile.name ?? null, email: profile.email ?? null };
}
