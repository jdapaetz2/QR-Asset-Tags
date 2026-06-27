import { ROLES, type Role } from "@/lib/auth/roles";

/**
 * Role-appropriate primary navigation. Pure (no I/O) so it is easy to test and
 * keeps the shared shell generic. Sprint 1 only has the two landing routes;
 * later sprints add more links here.
 */

export type NavItem = { label: string; href: string };

export function navForRole(role: Role): NavItem[] {
  if (role === ROLES.PLATFORM_OWNER) {
    return [
      { label: "Organizations", href: "/owner" },
      { label: "Tag requests", href: "/owner/tag-requests" },
      { label: "Analytics", href: "/owner/analytics" },
      { label: "Production", href: "/owner/production" },
    ];
  }
  // Customer admin/staff: working customer routes only — never any /owner/* link.
  return [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Assets", href: "/dashboard/assets" },
    { label: "Submissions", href: "/dashboard/submissions" },
    { label: "Analytics", href: "/dashboard/analytics" },
    { label: "Tag requests", href: "/dashboard/tag-requests" },
    { label: "Settings", href: "/dashboard/settings" },
  ];
}
