import { describe, expect, it } from "vitest";

import { navForRole } from "./nav";
import { ROLES } from "./roles";

describe("navForRole", () => {
  it("gives the platform owner the org/tag-request/analytics/production links", () => {
    expect(navForRole(ROLES.PLATFORM_OWNER)).toEqual([
      { label: "Organizations", href: "/owner" },
      { label: "Tag requests", href: "/owner/tag-requests" },
      { label: "Analytics", href: "/owner/analytics" },
      { label: "Production", href: "/owner/production" },
    ]);
  });

  it("gives the customer admin the full customer routes (with Rentals)", () => {
    expect(navForRole(ROLES.CUSTOMER_ADMIN)).toEqual([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Assets", href: "/dashboard/assets" },
      { label: "Submissions", href: "/dashboard/submissions", badge: "submissions_new" },
      { label: "Rentals", href: "/dashboard/rentals" },
      { label: "Analytics", href: "/dashboard/analytics" },
      { label: "Tag requests", href: "/dashboard/tag-requests" },
      { label: "Settings", href: "/dashboard/settings" },
    ]);
  });

  it("gives staff a reduced nav with Rentals but no Settings or Tag requests", () => {
    const staff = navForRole(ROLES.CUSTOMER_STAFF);
    expect(staff).toEqual([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Assets", href: "/dashboard/assets" },
      { label: "Submissions", href: "/dashboard/submissions", badge: "submissions_new" },
      { label: "Rentals", href: "/dashboard/rentals" },
      { label: "Analytics", href: "/dashboard/analytics" },
    ]);
    const labels = staff.map((i) => i.label);
    expect(labels).not.toContain("Settings");
    expect(labels).not.toContain("Tag requests");
  });

  it("shows Rentals to both customer roles (Wave 3N.1)", () => {
    for (const role of [ROLES.CUSTOMER_ADMIN, ROLES.CUSTOMER_STAFF]) {
      expect(navForRole(role).some((i) => i.href === "/dashboard/rentals")).toBe(true);
    }
  });

  it("never puts Data export in any top nav (it is a conditional Settings item)", () => {
    for (const role of [ROLES.PLATFORM_OWNER, ROLES.CUSTOMER_ADMIN, ROLES.CUSTOMER_STAFF]) {
      for (const item of navForRole(role)) {
        expect(item.href).not.toBe("/dashboard/export");
        expect(item.label).not.toBe("Data export");
      }
    }
  });

  it("never exposes an /owner link to org users (role boundary)", () => {
    for (const role of [ROLES.CUSTOMER_ADMIN, ROLES.CUSTOMER_STAFF]) {
      for (const item of navForRole(role)) {
        expect(item.href.startsWith("/owner")).toBe(false);
      }
    }
  });
});
