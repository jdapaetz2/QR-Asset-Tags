/**
 * Pure invitation / team-management helpers. No I/O — the gated server actions
 * supply the inviter's role/org (from their profile) and the route org id, then
 * apply these decisions. Keeping the role boundaries here makes them unit-tested
 * and impossible to bypass from form input.
 *
 * Role rules (MVP): the platform owner invites customer admins + staff; a customer
 * admin invites staff only. `platform_owner` is NEVER invitable from the UI —
 * platform-owner creation stays manual (seed_profiles runbook).
 */

import { ROLES, type Role, isRole } from "@/lib/auth/roles";

/** Roles a given inviter may create. Empty for anyone who can't invite. */
export function invitableRoles(inviterRole: string): Role[] {
  switch (inviterRole) {
    case ROLES.PLATFORM_OWNER:
      return [ROLES.CUSTOMER_ADMIN, ROLES.CUSTOMER_STAFF];
    case ROLES.CUSTOMER_ADMIN:
      return [ROLES.CUSTOMER_STAFF];
    default:
      return [];
  }
}

export function canInviteRole(inviterRole: string, targetRole: string): boolean {
  return (invitableRoles(inviterRole) as readonly string[]).includes(targetRole);
}

export type OrgResolution =
  | { organizationId: string; error?: undefined }
  | { organizationId?: undefined; error: string };

/**
 * Resolve which organization an invite targets. The platform owner invites into the
 * route's org; a customer admin is FORCED to their own org (any form-supplied org is
 * ignored) so they can never invite across tenants.
 */
export function resolveInviteOrgId(params: {
  inviterRole: string;
  inviterOrgId: string | null;
  routeOrgId?: string | null;
}): OrgResolution {
  if (params.inviterRole === ROLES.PLATFORM_OWNER) {
    const org = (params.routeOrgId ?? "").trim();
    if (!org) return { error: "No organization selected." };
    return { organizationId: org };
  }
  if (params.inviterRole === ROLES.CUSTOMER_ADMIN) {
    if (!params.inviterOrgId) return { error: "Your account has no organization." };
    return { organizationId: params.inviterOrgId };
  }
  return { error: "You are not allowed to invite users." };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteInput = { email: string; name: string | null; role: Role };
export type InviteValidation =
  | { value: InviteInput; error?: undefined }
  | { value?: undefined; error: string };

/**
 * Validate an invite form against the inviter's allowed roles. Email must be valid,
 * name is optional, and the role must be one the inviter may create (which excludes
 * `platform_owner` by construction).
 */
export function validateInvite(
  raw: { email?: string; name?: string; role?: string },
  allowedRoles: readonly Role[]
): InviteValidation {
  const email = (raw.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const role = raw.role ?? "";
  if (!isRole(role) || !(allowedRoles as readonly string[]).includes(role)) {
    return { error: "You cannot invite a user with that role." };
  }

  const nameTrimmed = (raw.name ?? "").trim();
  return { value: { email, name: nameTrimmed.length ? nameTrimmed : null, role } };
}

export type InviteDecision =
  | "none"
  | "regenerate"
  | "active"
  | "disabled"
  | "other_org";

/**
 * Decide how to handle an invite for an email that may already have a profile.
 * `existing` is the looked-up profile (or null when the email is new):
 * - `null` → `none` (create a fresh invite).
 * - different org, or a null-org platform_owner → `other_org` (block; never move users).
 * - same org + `invited` → `regenerate` (issue a fresh link, no new user/profile).
 * - same org + `disabled` → `disabled` (re-enable first).
 * - same org + anything else (active) → `active` (already a member).
 */
export function inviteDecision(
  existing: { organization_id: string | null; status: string } | null,
  targetOrgId: string
): InviteDecision {
  if (!existing) return "none";
  if (existing.organization_id == null || existing.organization_id !== targetOrgId) {
    return "other_org";
  }
  if (existing.status === "invited") return "regenerate";
  if (existing.status === "disabled") return "disabled";
  return "active";
}

/**
 * Whether `actor` may manage (disable/enable/role-change) `target`. Platform owners
 * are never manageable through team tools; the owner manages anyone else; a customer
 * admin manages only `customer_staff` in their own org (never admins, never other orgs).
 */
export function canManageMember(params: {
  actorRole: string;
  actorOrgId: string | null;
  targetRole: string;
  targetOrgId: string | null;
}): boolean {
  if (params.targetRole === ROLES.PLATFORM_OWNER) return false;
  if (params.actorRole === ROLES.PLATFORM_OWNER) return true;
  if (params.actorRole === ROLES.CUSTOMER_ADMIN) {
    return (
      params.targetRole === ROLES.CUSTOMER_STAFF &&
      params.actorOrgId != null &&
      params.actorOrgId === params.targetOrgId
    );
  }
  return false;
}

export const PROFILE_STATUSES = ["active", "invited", "disabled"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export function isProfileStatus(value: unknown): value is ProfileStatus {
  return (
    typeof value === "string" &&
    (PROFILE_STATUSES as readonly string[]).includes(value)
  );
}

const STATUS_LABELS: Record<ProfileStatus, string> = {
  active: "Active",
  invited: "Invited",
  disabled: "Disabled",
};

export function profileStatusLabel(status: string): string {
  return isProfileStatus(status) ? STATUS_LABELS[status] : status;
}
