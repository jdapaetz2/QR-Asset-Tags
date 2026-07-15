import { ROLES, type Role } from "@/lib/auth/roles";

/**
 * Role-appropriate primary navigation. Pure (no I/O) so it is easy to test and
 * keeps the shared shell generic. Sprint 1 only has the two landing routes;
 * later sprints add more links here.
 */

export type NavItem = {
  label: string;
  href: string;
  /** Marks the item that carries the live "new submissions" badge in the shell. */
  badge?: "submissions_new";
};

export function navForRole(role: Role): NavItem[] {
  if (role === ROLES.PLATFORM_OWNER) {
    return [
      { label: "Organizations", href: "/owner" },
      { label: "Tag requests", href: "/owner/tag-requests" },
      { label: "Analytics", href: "/owner/analytics" },
      { label: "Production", href: "/owner/production" },
    ];
  }
  // Customer staff: a reduced nav focused on the daily loop — Rentals is an operational
  // surface (session evidence) so it belongs here, but no org Settings or Tag-request
  // procurement. Display-only; each route enforces its own role/org guard (Wave 3N.1).
  if (role === ROLES.CUSTOMER_STAFF) {
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Assets", href: "/dashboard/assets" },
      { label: "Submissions", href: "/dashboard/submissions", badge: "submissions_new" },
      { label: "Rentals", href: "/dashboard/rentals" },
      { label: "Analytics", href: "/dashboard/analytics" },
    ];
  }
  // Customer admin: full customer routes — never any /owner/* link. Two deliberate omissions (Wave 3N.2):
  // Tag requests lives under the Assets area (secondary nav), not the top nav; Data export is a conditional
  // secondary item under Settings, shown only when the owner has enabled the org's export capability
  // (see canCustomerUseExport). Keeps the primary bar to six uncrowded destinations.
  return [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Assets", href: "/dashboard/assets" },
    { label: "Submissions", href: "/dashboard/submissions", badge: "submissions_new" },
    { label: "Rentals", href: "/dashboard/rentals" },
    { label: "Analytics", href: "/dashboard/analytics" },
    { label: "Settings", href: "/dashboard/settings" },
  ];
}
