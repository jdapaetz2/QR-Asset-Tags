import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/auth/roles";
import {
  canInviteRole,
  canManageMember,
  duplicateInviteOutcome,
  invitableRoles,
  isProfileStatus,
  profileStatusLabel,
  resolveInviteOrgId,
  validateInvite,
} from "./invitations";

describe("invitableRoles / canInviteRole", () => {
  it("owner can invite customer admin + staff, never platform_owner", () => {
    expect(invitableRoles(ROLES.PLATFORM_OWNER)).toEqual([
      ROLES.CUSTOMER_ADMIN,
      ROLES.CUSTOMER_STAFF,
    ]);
    expect(canInviteRole(ROLES.PLATFORM_OWNER, ROLES.CUSTOMER_ADMIN)).toBe(true);
    expect(canInviteRole(ROLES.PLATFORM_OWNER, ROLES.PLATFORM_OWNER)).toBe(false);
  });

  it("customer admin can invite staff only", () => {
    expect(invitableRoles(ROLES.CUSTOMER_ADMIN)).toEqual([ROLES.CUSTOMER_STAFF]);
    expect(canInviteRole(ROLES.CUSTOMER_ADMIN, ROLES.CUSTOMER_STAFF)).toBe(true);
    expect(canInviteRole(ROLES.CUSTOMER_ADMIN, ROLES.CUSTOMER_ADMIN)).toBe(false);
    expect(canInviteRole(ROLES.CUSTOMER_ADMIN, ROLES.PLATFORM_OWNER)).toBe(false);
  });

  it("staff (and unknown) can invite no one", () => {
    expect(invitableRoles(ROLES.CUSTOMER_STAFF)).toEqual([]);
    expect(invitableRoles("nonsense")).toEqual([]);
  });
});

describe("resolveInviteOrgId", () => {
  it("owner targets the route org", () => {
    expect(
      resolveInviteOrgId({
        inviterRole: ROLES.PLATFORM_OWNER,
        inviterOrgId: null,
        routeOrgId: "org-9",
      })
    ).toEqual({ organizationId: "org-9" });
  });

  it("owner without a route org errors", () => {
    expect(
      resolveInviteOrgId({ inviterRole: ROLES.PLATFORM_OWNER, inviterOrgId: null })
        .error
    ).toMatch(/no organization/i);
  });

  it("customer admin is forced to their own org, ignoring any route/form org", () => {
    expect(
      resolveInviteOrgId({
        inviterRole: ROLES.CUSTOMER_ADMIN,
        inviterOrgId: "org-self",
        routeOrgId: "org-other",
      })
    ).toEqual({ organizationId: "org-self" });
  });

  it("staff cannot resolve an invite org", () => {
    expect(
      resolveInviteOrgId({ inviterRole: ROLES.CUSTOMER_STAFF, inviterOrgId: "org-1" })
        .error
    ).toMatch(/not allowed/i);
  });
});

describe("validateInvite", () => {
  const allowed = [ROLES.CUSTOMER_STAFF];

  it("accepts a valid email + allowed role and lowercases the email", () => {
    const r = validateInvite(
      { email: "  Staff@Acme.Example ", name: " Sam ", role: "customer_staff" },
      allowed
    );
    expect(r.value).toEqual({
      email: "staff@acme.example",
      name: "Sam",
      role: "customer_staff",
    });
  });

  it("rejects a bad email", () => {
    expect(validateInvite({ email: "nope", role: "customer_staff" }, allowed).error).toMatch(
      /valid email/i
    );
  });

  it("rejects a role outside the allowed set (incl. platform_owner)", () => {
    expect(
      validateInvite({ email: "a@b.co", role: "customer_admin" }, allowed).error
    ).toMatch(/cannot invite/i);
    expect(
      validateInvite({ email: "a@b.co", role: "platform_owner" }, allowed).error
    ).toMatch(/cannot invite/i);
  });
});

describe("duplicateInviteOutcome", () => {
  it("none when no existing profile", () => {
    expect(duplicateInviteOutcome(undefined, "org-1")).toBe("none");
  });
  it("same_org when the existing profile is in the target org", () => {
    expect(duplicateInviteOutcome("org-1", "org-1")).toBe("same_org");
  });
  it("other_org for a different org or a null-org (platform_owner) profile", () => {
    expect(duplicateInviteOutcome("org-2", "org-1")).toBe("other_org");
    expect(duplicateInviteOutcome(null, "org-1")).toBe("other_org");
  });
});

describe("canManageMember", () => {
  it("owner manages any non-owner; never a platform owner", () => {
    expect(
      canManageMember({
        actorRole: ROLES.PLATFORM_OWNER,
        actorOrgId: null,
        targetRole: ROLES.CUSTOMER_ADMIN,
        targetOrgId: "org-1",
      })
    ).toBe(true);
    expect(
      canManageMember({
        actorRole: ROLES.PLATFORM_OWNER,
        actorOrgId: null,
        targetRole: ROLES.PLATFORM_OWNER,
        targetOrgId: null,
      })
    ).toBe(false);
  });

  it("customer admin manages only staff in their own org", () => {
    const base = { actorRole: ROLES.CUSTOMER_ADMIN, actorOrgId: "org-1" };
    expect(
      canManageMember({ ...base, targetRole: ROLES.CUSTOMER_STAFF, targetOrgId: "org-1" })
    ).toBe(true);
    // not another admin
    expect(
      canManageMember({ ...base, targetRole: ROLES.CUSTOMER_ADMIN, targetOrgId: "org-1" })
    ).toBe(false);
    // not another org's staff
    expect(
      canManageMember({ ...base, targetRole: ROLES.CUSTOMER_STAFF, targetOrgId: "org-2" })
    ).toBe(false);
  });

  it("staff manage no one", () => {
    expect(
      canManageMember({
        actorRole: ROLES.CUSTOMER_STAFF,
        actorOrgId: "org-1",
        targetRole: ROLES.CUSTOMER_STAFF,
        targetOrgId: "org-1",
      })
    ).toBe(false);
  });
});

describe("profile status helpers", () => {
  it("validates and labels statuses", () => {
    expect(isProfileStatus("invited")).toBe(true);
    expect(isProfileStatus("bogus")).toBe(false);
    expect(profileStatusLabel("active")).toBe("Active");
    expect(profileStatusLabel("disabled")).toBe("Disabled");
  });
});
