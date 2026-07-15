import { describe, expect, it } from "vitest";

import { canCustomerUseExport } from "./access";
import { toExportFlags, type ExportFlags } from "./types";
import { ROLES } from "@/lib/auth/roles";

const flags = (over: Partial<ExportFlags> = {}): ExportFlags =>
  toExportFlags({ customer_exports_enabled: true, ...over });

describe("canCustomerUseExport (Wave 3N.1)", () => {
  it("true only for a customer_admin whose org export capability is enabled", () => {
    expect(canCustomerUseExport({ role: ROLES.CUSTOMER_ADMIN, flags: flags() })).toBe(true);
  });

  it("false for a customer_admin when the capability is disabled", () => {
    expect(
      canCustomerUseExport({
        role: ROLES.CUSTOMER_ADMIN,
        flags: flags({ customer_exports_enabled: false }),
      })
    ).toBe(false);
  });

  it("false for customer_staff even when the capability is enabled", () => {
    expect(canCustomerUseExport({ role: ROLES.CUSTOMER_STAFF, flags: flags() })).toBe(false);
  });

  it("false for a platform owner (owner uses the separate owner-side org export)", () => {
    expect(canCustomerUseExport({ role: ROLES.PLATFORM_OWNER, flags: flags() })).toBe(false);
  });

  it("fails closed for missing / null flags", () => {
    expect(canCustomerUseExport({ role: ROLES.CUSTOMER_ADMIN, flags: toExportFlags(null) })).toBe(false);
    expect(canCustomerUseExport({ role: ROLES.CUSTOMER_ADMIN, flags: toExportFlags(undefined) })).toBe(false);
    expect(canCustomerUseExport({ role: ROLES.CUSTOMER_ADMIN, flags: toExportFlags({}) })).toBe(false);
  });
});
