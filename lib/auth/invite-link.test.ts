import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/auth/roles";
import {
  AUTH_ACTION_TYPES,
  authActionDestination,
  buildInviteUrl,
  isAuthActionType,
} from "./invite-link";

describe("buildInviteUrl", () => {
  it("points at the prefetch-safe /auth/action route with encoded params", () => {
    expect(buildInviteUrl("https://app.example.com", "abc123", "invite")).toBe(
      "https://app.example.com/auth/action?token_hash=abc123&type=invite"
    );
  });

  it("trims a trailing slash and encodes special characters", () => {
    expect(buildInviteUrl("https://app.example.com/", "a+b/c=", "invite")).toBe(
      "https://app.example.com/auth/action?token_hash=a%2Bb%2Fc%3D&type=invite"
    );
  });
});

describe("isAuthActionType", () => {
  it("accepts the known types and rejects others", () => {
    for (const t of AUTH_ACTION_TYPES) expect(isAuthActionType(t)).toBe(true);
    expect(isAuthActionType("recovery")).toBe(false);
    expect(isAuthActionType(null)).toBe(false);
  });
});

describe("authActionDestination", () => {
  it("sends invited users to set a password first (regardless of role)", () => {
    expect(authActionDestination("invited", ROLES.CUSTOMER_ADMIN)).toBe(
      "/auth/set-password"
    );
    expect(authActionDestination("invited", ROLES.PLATFORM_OWNER)).toBe(
      "/auth/set-password"
    );
  });

  it("sends active users to their role landing", () => {
    expect(authActionDestination("active", ROLES.PLATFORM_OWNER)).toBe("/owner");
    expect(authActionDestination("active", ROLES.CUSTOMER_ADMIN)).toBe("/dashboard");
    expect(authActionDestination("active", ROLES.CUSTOMER_STAFF)).toBe("/dashboard");
  });
});
