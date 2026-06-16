import { ROLES, type Role } from "@/lib/auth/roles";

/**
 * Pure authorization helpers — no I/O, no framework imports — so they are cheap
 * to unit-test and safe to import anywhere. Server-side gating that performs
 * redirects lives in `lib/auth/session.ts`.
 */

/** Whether `role` is in the `allowed` set. */
export function isAuthorized(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}

/** Where a role lands after login: owner → /owner, everyone else → /dashboard. */
export function landingPathForRole(role: Role): string {
  return role === ROLES.PLATFORM_OWNER ? "/owner" : "/dashboard";
}
