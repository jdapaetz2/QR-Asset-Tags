import { describe, expect, it } from "vitest";

import { OWNER_ORG_TABS, ownerOrgTabs } from "./org-nav";

describe("ownerOrgTabs", () => {
  const orgId = "org-123";
  const tabs = ownerOrgTabs(orgId);

  it("returns the five approved org tabs, in order", () => {
    expect(tabs.map((t) => t.key)).toEqual(["overview", "qr", "users", "export", "settings"]);
    expect(OWNER_ORG_TABS).toEqual(["overview", "qr", "users", "export", "settings"]);
  });

  it("routes every tab under the organization id", () => {
    const base = `/owner/organizations/${orgId}`;
    expect(tabs.find((t) => t.key === "overview")!.href).toBe(base);
    expect(tabs.find((t) => t.key === "qr")!.href).toBe(`${base}/qr`);
    expect(tabs.find((t) => t.key === "users")!.href).toBe(`${base}/users`);
    expect(tabs.find((t) => t.key === "export")!.href).toBe(`${base}/export`);
    expect(tabs.find((t) => t.key === "settings")!.href).toBe(`${base}/settings`);
  });

  it("always includes owner Export (never gated by a customer flag)", () => {
    expect(tabs.some((t) => t.key === "export" && t.label === "Export")).toBe(true);
  });
});
