/**
 * Shared role definitions. Kept in one place so the database (RLS policies,
 * `profiles.role` CHECK constraint) and the app agree on the same values.
 *
 * Full session/role resolution helpers are added in Sprint 1; this module
 * intentionally holds only the shared types and constants.
 *
 * See docs/SECURITY_MODEL.md and docs/DATA_MODEL.md.
 */

export const ROLES = {
  PLATFORM_OWNER: "platform_owner",
  CUSTOMER_ADMIN: "customer_admin",
  CUSTOMER_STAFF: "customer_staff",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ALL_ROLES as readonly string[]).includes(value)
  );
}
