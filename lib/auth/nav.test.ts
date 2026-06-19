import { describe, expect, it } from "vitest";

import { navForRole } from "./nav";
import { ROLES } from "./roles";

describe("navForRole", () => {
  it("gives the platform owner the organizations and production links", () => {
    expect(navForRole(ROLES.PLATFORM_OWNER)).toEqual([
      { label: "Organizations", href: "/owner" },
      { label: "Production", href: "/owner/production" },
    ]);
  });

  it("gives org users only the dashboard link (no production)", () => {
    const expected = [{ label: "Dashboard", href: "/dashboard" }];
    expect(navForRole(ROLES.CUSTOMER_ADMIN)).toEqual(expected);
    expect(navForRole(ROLES.CUSTOMER_STAFF)).toEqual(expected);
  });
});
