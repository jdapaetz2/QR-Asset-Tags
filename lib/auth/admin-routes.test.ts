import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Wave 3N.1: navigation and route authorization must AGREE. Admin-only config surfaces must enforce
// customer_admin on the server (requireCustomerAdminOrgId), not merely hide a nav link. Staff-allowed
// operational surfaces keep the org-membership guard (requireOrgId / requireOrgContext). Structural check.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(resolve(repo, p), "utf8");

const ADMIN_ONLY = [
  "app/(admin)/dashboard/settings/page.tsx",
  "app/(admin)/dashboard/export/page.tsx",
  "app/(admin)/dashboard/export/download/route.ts",
  "app/(admin)/dashboard/tag-requests/page.tsx",
  "app/(admin)/dashboard/tag-requests/new/page.tsx",
  "app/(admin)/dashboard/tag-requests/[id]/page.tsx",
  "app/(admin)/dashboard/templates/page.tsx",
  "app/(admin)/dashboard/templates/new/page.tsx",
  "app/(admin)/dashboard/templates/[templateId]/page.tsx",
  "app/(admin)/dashboard/templates/return-inspections/page.tsx",
  "app/(admin)/dashboard/templates/return-inspections/custom/[id]/page.tsx",
  "app/(admin)/dashboard/assets/import/page.tsx",
  "app/(admin)/dashboard/assets/import/template.csv/route.ts",
  "app/(admin)/dashboard/assets/templates/page.tsx",
];

// Operational surfaces that both customer_admin AND customer_staff may use — must NOT be admin-gated.
const STAFF_ALLOWED = [
  "app/(admin)/dashboard/assets/page.tsx",
  "app/(admin)/dashboard/assets/[assetId]/page.tsx",
  "app/(admin)/dashboard/assets/[assetId]/timeline/page.tsx",
  "app/(admin)/dashboard/submissions/page.tsx",
  "app/(admin)/dashboard/submissions/[submissionId]/page.tsx",
  "app/(admin)/dashboard/submissions/export/route.ts",
  "app/(admin)/dashboard/rentals/page.tsx",
  "app/(admin)/dashboard/rentals/[sessionId]/page.tsx",
  "app/(admin)/dashboard/analytics/page.tsx",
];

describe("route-guard vs nav agreement (Wave 3N.1)", () => {
  it("every admin-only config route enforces customer_admin on the server", () => {
    for (const p of ADMIN_ONLY) {
      expect(read(p), p).toContain("requireCustomerAdminOrgId");
    }
  });

  it("settings/users stays role-gated to customer_admin", () => {
    expect(read("app/(admin)/dashboard/settings/users/page.tsx")).toMatch(
      /requireRole\(ROLES\.CUSTOMER_ADMIN\)|requireCustomerAdminOrgId/
    );
  });

  it("staff-allowed operational routes are NOT admin-gated", () => {
    for (const p of STAFF_ALLOWED) {
      expect(read(p), p).not.toContain("requireCustomerAdminOrgId");
    }
  });

  it("the export page + download handler are capability-gated (fail closed)", () => {
    expect(read("app/(admin)/dashboard/export/page.tsx")).toContain("canCustomerUseExport");
    expect(read("app/(admin)/dashboard/export/download/route.ts")).toContain("isExportTypeEnabled");
  });

  it("dashboard + settings surface export only via canCustomerUseExport", () => {
    expect(read("app/(admin)/dashboard/page.tsx")).toContain("canCustomerUseExport");
    expect(read("app/(admin)/dashboard/settings/page.tsx")).toContain("canCustomerUseExport");
  });
});
