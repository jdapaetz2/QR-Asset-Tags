import { describe, expect, it } from "vitest";

import { isAuthorized, landingPathForRole } from "./policy";
import { ROLES } from "./roles";

describe("isAuthorized", () => {
  it("allows a role that is in the allowed set", () => {
    expect(isAuthorized(ROLES.CUSTOMER_ADMIN, [ROLES.CUSTOMER_ADMIN])).toBe(true);
    expect(
      isAuthorized(ROLES.PLATFORM_OWNER, [ROLES.PLATFORM_OWNER, ROLES.CUSTOMER_ADMIN])
    ).toBe(true);
  });

  it("denies a role that is not in the allowed set", () => {
    expect(isAuthorized(ROLES.CUSTOMER_STAFF, [ROLES.PLATFORM_OWNER])).toBe(false);
    expect(isAuthorized(ROLES.CUSTOMER_ADMIN, [])).toBe(false);
  });
});

describe("landingPathForRole", () => {
  it("sends the platform owner to /owner", () => {
    expect(landingPathForRole(ROLES.PLATFORM_OWNER)).toBe("/owner");
  });

  it("sends org users to /dashboard", () => {
    expect(landingPathForRole(ROLES.CUSTOMER_ADMIN)).toBe("/dashboard");
    expect(landingPathForRole(ROLES.CUSTOMER_STAFF)).toBe("/dashboard");
  });
});
