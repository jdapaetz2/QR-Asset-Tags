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

  it("gives org users the customer routes", () => {
    const expected = [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Assets", href: "/dashboard/assets" },
      { label: "Submissions", href: "/dashboard/submissions" },
      { label: "Analytics", href: "/dashboard/analytics" },
      { label: "Tag requests", href: "/dashboard/tag-requests" },
      { label: "Settings", href: "/dashboard/settings" },
    ];
    expect(navForRole(ROLES.CUSTOMER_ADMIN)).toEqual(expected);
    expect(navForRole(ROLES.CUSTOMER_STAFF)).toEqual(expected);
  });

  it("never exposes an /owner link to org users (role boundary)", () => {
    for (const role of [ROLES.CUSTOMER_ADMIN, ROLES.CUSTOMER_STAFF]) {
      for (const item of navForRole(role)) {
        expect(item.href.startsWith("/owner")).toBe(false);
      }
    }
  });
});
