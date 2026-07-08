import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/auth/roles";
import {
  isOrgActive,
  isOrgStatus,
  orgAccessAllowed,
  validateOrgStatus,
} from "./status";

describe("isOrgStatus / isOrgActive", () => {
  it("recognizes the two allowed statuses", () => {
    expect(isOrgStatus("active")).toBe(true);
    expect(isOrgStatus("suspended")).toBe(true);
    expect(isOrgStatus("bogus")).toBe(false);
    expect(isOrgStatus(null)).toBe(false);
  });

  it("isOrgActive is true only for active", () => {
    expect(isOrgActive("active")).toBe(true);
    expect(isOrgActive("suspended")).toBe(false);
    expect(isOrgActive(null)).toBe(false);
    expect(isOrgActive(undefined)).toBe(false);
  });
});

describe("validateOrgStatus", () => {
  it("accepts and trims allowed values", () => {
    expect(validateOrgStatus(" active ")).toEqual({ value: "active" });
    expect(validateOrgStatus("suspended")).toEqual({ value: "suspended" });
  });

  it("rejects anything else", () => {
    expect(validateOrgStatus("disabled").error).toMatch(/active or suspended/i);
    expect(validateOrgStatus("").error).toMatch(/active or suspended/i);
    expect(validateOrgStatus(null).error).toMatch(/active or suspended/i);
  });
});

describe("orgAccessAllowed", () => {
  it("platform owner is never gated by org status", () => {
    expect(orgAccessAllowed({ role: ROLES.PLATFORM_OWNER, orgActive: false })).toBe(true);
    expect(orgAccessAllowed({ role: ROLES.PLATFORM_OWNER, orgActive: true })).toBe(true);
  });

  it("customer roles require an active org", () => {
    expect(orgAccessAllowed({ role: ROLES.CUSTOMER_ADMIN, orgActive: true })).toBe(true);
    expect(orgAccessAllowed({ role: ROLES.CUSTOMER_ADMIN, orgActive: false })).toBe(false);
    expect(orgAccessAllowed({ role: ROLES.CUSTOMER_STAFF, orgActive: false })).toBe(false);
  });
});
