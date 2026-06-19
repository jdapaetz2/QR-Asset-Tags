import { describe, expect, it } from "vitest";

import { ROLES, isRole, roleLabel } from "./roles";

describe("isRole", () => {
  it("accepts known roles and rejects others", () => {
    expect(isRole(ROLES.PLATFORM_OWNER)).toBe(true);
    expect(isRole(ROLES.CUSTOMER_ADMIN)).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});

describe("roleLabel", () => {
  it("maps roles to friendly labels", () => {
    expect(roleLabel(ROLES.PLATFORM_OWNER)).toBe("Platform admin");
    expect(roleLabel(ROLES.CUSTOMER_ADMIN)).toBe("Administrator");
    expect(roleLabel(ROLES.CUSTOMER_STAFF)).toBe("Staff");
  });

  it("falls back to the raw value for unknown roles", () => {
    expect(roleLabel("mystery")).toBe("mystery");
  });
});
