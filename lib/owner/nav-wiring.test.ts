import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Wave 3N.4: the platform owner keeps the organization in context across its tabs, and org context survives
// through Production and Tag requests. Server components → asserted structurally (node env).
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(resolve(repo, p), "utf8");

const ORG = "app/(platform)/owner/organizations/[organizationId]";

describe("organization sub-navigation (Part B)", () => {
  const subnav = read("components/owner/org-subnav.tsx");

  it("renders the org name, an all-organizations link, and the five tabs via ownerOrgTabs", () => {
    expect(subnav).toContain("orgName");
    expect(subnav).toContain("← All organizations");
    expect(subnav).toContain('href="/owner"');
    expect(subnav).toContain("ownerOrgTabs(orgId)");
    expect(subnav).toContain("SecondaryNav");
  });

  it("owner Export is always in the tab set — never gated by the customer export capability", () => {
    // The tab source is the pure ownerOrgTabs (asserted in org-nav.test.ts); the sub-nav must NOT import
    // the customer gating helper, so owner Export can never be hidden.
    expect(subnav).not.toContain("canCustomerUseExport");
    expect(subnav).not.toContain("customer_exports_enabled");
  });

  it("every org page renders <OwnerOrgSubnav> with the correct active tab", () => {
    const cases: [string, string][] = [
      [`${ORG}/page.tsx`, 'active="overview"'],
      [`${ORG}/qr/page.tsx`, 'active="qr"'],
      [`${ORG}/users/page.tsx`, 'active="users"'],
      [`${ORG}/export/page.tsx`, 'active="export"'],
      [`${ORG}/settings/page.tsx`, 'active="settings"'],
    ];
    for (const [file, active] of cases) {
      const src = read(file);
      expect(src, file).toContain("<OwnerOrgSubnav");
      expect(src, file).toContain(active);
    }
  });
});

describe("owner export stays independent of the customer flag (Part B / acceptance 3-4)", () => {
  it("the owner org export page + download route guard only on PLATFORM_OWNER and never read the customer flag", () => {
    const page = read(`${ORG}/export/page.tsx`);
    expect(page).toContain("requireRole(ROLES.PLATFORM_OWNER)");
    expect(page).not.toContain("canCustomerUseExport");
    expect(page).not.toContain("customer_exports_enabled");
    const route = read(`${ORG}/export/download/route.ts`);
    expect(route).toContain("requireRole(ROLES.PLATFORM_OWNER)");
    expect(route).not.toContain("canCustomerUseExport");
    expect(route).not.toContain("customer_exports_enabled");
  });
});

describe("corrected Back paths + org-context preservation (Part C)", () => {
  it("org settings Back no longer jumps to the org list (regression guard)", () => {
    const settings = read(`${ORG}/settings/page.tsx`);
    // The bare `← Organizations` → /owner back arrow is gone; the sub-nav is the up-nav now.
    expect(settings).not.toContain("← Organizations");
    expect(settings).toContain("<OwnerOrgSubnav");
  });

  it("production offers Back to the org and preserves ?org (does not silently drop to the picker)", () => {
    const prod = read("app/(platform)/owner/production/page.tsx");
    expect(prod).toContain("← Back to");
    expect(prod).toContain("href={`/owner/organizations/${orgId}`}");
    expect(prod).toContain("Switch organization"); // the picker is now an explicit action
    expect(prod).toContain('name="org"'); // org filter retained in the GET form (unchanged)
  });

  it("tag requests preserve ?org on Back + row links, and the detail Back returns to the org-filtered list", () => {
    const list = read("app/(platform)/owner/tag-requests/page.tsx");
    expect(list).toContain("href={`/owner/organizations/${orgFilter}`}"); // Back to org
    expect(list).toContain("/owner/tag-requests/${r.id}?org=${orgFilter}"); // org on row links
    const detail = read("app/(platform)/owner/tag-requests/[id]/page.tsx");
    expect(detail).toContain("`/owner/tag-requests?org=${request.organization_id}`");
  });
});

describe("global Users discoverability (Part D)", () => {
  it("the Organizations page links to /owner/users as a secondary action", () => {
    const home = read("app/(platform)/owner/page.tsx");
    expect(home).toContain('href="/owner/users"');
    expect(home).toContain("All users");
  });
});

describe("owner-role guards + missing-org 404 (Part E)", () => {
  it("every owner route guards on PLATFORM_OWNER", () => {
    for (const p of [
      `${ORG}/page.tsx`,
      `${ORG}/qr/page.tsx`,
      `${ORG}/users/page.tsx`,
      `${ORG}/export/page.tsx`,
      `${ORG}/settings/page.tsx`,
      "app/(platform)/owner/production/page.tsx",
      "app/(platform)/owner/tag-requests/page.tsx",
      "app/(platform)/owner/users/page.tsx",
    ]) {
      expect(read(p), p).toContain("requireRole(ROLES.PLATFORM_OWNER)");
    }
  });

  it("each org tab 404s a missing/unreadable organization", () => {
    for (const p of [
      `${ORG}/page.tsx`,
      `${ORG}/qr/page.tsx`,
      `${ORG}/users/page.tsx`,
      `${ORG}/export/page.tsx`,
      `${ORG}/settings/page.tsx`,
    ]) {
      expect(read(p), p).toContain("notFound()");
    }
  });
});
