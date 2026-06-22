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

/** Human-friendly labels so UI never shows raw role identifiers. */
export const ROLE_LABELS: Record<Role, string> = {
  platform_owner: "Platform admin",
  customer_admin: "Administrator",
  customer_staff: "Staff",
};

/** Display label for a role; falls back to the raw value for unknown inputs. */
export function roleLabel(role: string): string {
  return isRole(role) ? ROLE_LABELS[role] : role;
}
