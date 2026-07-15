import { describe, expect, it } from "vitest";

import { resolveContactPrefill, type PrefillProfile } from "./contact-prefill";
import { ROLES } from "@/lib/auth/roles";

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const profile = (over: Partial<PrefillProfile> = {}): PrefillProfile => ({
  organization_id: ORG,
  name: "Dana Rivera",
  email: "dana@northridge.test",
  role: ROLES.CUSTOMER_ADMIN,
  ...over,
});

describe("resolveContactPrefill (Phase 3C.8)", () => {
  it("prefills a same-org customer_admin", () => {
    expect(resolveContactPrefill(profile(), ORG)).toEqual({
      name: "Dana Rivera",
      email: "dana@northridge.test",
    });
  });

  it("prefills a same-org customer_staff", () => {
    expect(resolveContactPrefill(profile({ role: ROLES.CUSTOMER_STAFF }), ORG)).toEqual({
      name: "Dana Rivera",
      email: "dana@northridge.test",
    });
  });

  it("returns null for an unauthenticated viewer", () => {
    expect(resolveContactPrefill(null, ORG)).toBeNull();
    expect(resolveContactPrefill(undefined, ORG)).toBeNull();
  });

  it("returns null for a cross-org authenticated viewer", () => {
    expect(resolveContactPrefill(profile({ organization_id: OTHER }), ORG)).toBeNull();
  });

  it("returns null for a platform owner accessing another org's form", () => {
    // Platform owner's org id won't equal the asset's org → no prefill.
    expect(
      resolveContactPrefill(profile({ role: ROLES.PLATFORM_OWNER, organization_id: OTHER }), ORG)
    ).toBeNull();
    // Even a null-org owner never matches.
    expect(
      resolveContactPrefill(profile({ role: ROLES.PLATFORM_OWNER, organization_id: null }), ORG)
    ).toBeNull();
  });

  it("returns null when the asset has no organization", () => {
    expect(resolveContactPrefill(profile(), null)).toBeNull();
  });

  it("keeps a null name but still supplies email; never supplies phone", () => {
    const result = resolveContactPrefill(profile({ name: null }), ORG);
    expect(result).toEqual({ name: null, email: "dana@northridge.test" });
    expect(result).not.toHaveProperty("phone");
  });
});
