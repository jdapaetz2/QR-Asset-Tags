import { describe, expect, it } from "vitest";

import { normalizeOrgSettings } from "./settings";

describe("normalizeOrgSettings", () => {
  it("requires a name", () => {
    expect(normalizeOrgSettings({}).error).toMatch(/name/i);
    expect(normalizeOrgSettings({ name: "   " }).error).toMatch(/name/i);
  });

  it("accepts a full valid payload and trims/null-maps optionals", () => {
    const result = normalizeOrgSettings({
      name: "  Northridge Rentals ",
      support_phone: " +1-555-0100 ",
      support_email: "ops@northridge.example",
      website_url: "https://northridge.example",
      primary_color: "#1d4ed8",
      logo_url: "/demo-assets/excavator-017.svg",
    });
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      name: "Northridge Rentals",
      support_phone: "+1-555-0100",
      support_email: "ops@northridge.example",
      website_url: "https://northridge.example",
      primary_color: "#1d4ed8",
      logo_url: "/demo-assets/excavator-017.svg",
    });
  });

  it("maps empty optionals to null", () => {
    const result = normalizeOrgSettings({ name: "x", primary_color: "", logo_url: "" });
    expect(result.value?.primary_color).toBeNull();
    expect(result.value?.logo_url).toBeNull();
    expect(result.value?.support_email).toBeNull();
  });

  it("rejects an invalid support email", () => {
    expect(
      normalizeOrgSettings({ name: "x", support_email: "not-an-email" }).error
    ).toMatch(/email/i);
  });

  it("rejects a non-http website", () => {
    expect(
      normalizeOrgSettings({ name: "x", website_url: "ftp://x.example" }).error
    ).toMatch(/website/i);
  });

  it("rejects a non-hex primary color (no arbitrary CSS)", () => {
    for (const bad of ["#fff", "red", "#12g456", "#1d4ed8; background:red"]) {
      expect(
        normalizeOrgSettings({ name: "x", primary_color: bad }).error
      ).toMatch(/color/i);
    }
  });

  it("rejects an unsafe logo url", () => {
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AA", "/etc/x"]) {
      expect(normalizeOrgSettings({ name: "x", logo_url: bad }).error).toMatch(
        /logo/i
      );
    }
  });

  it("never reads or produces organization_id from form input", () => {
    const result = normalizeOrgSettings({
      name: "x",
      organization_id: "attacker-supplied",
    } as Record<string, string>);
    expect(result.value).not.toHaveProperty("organization_id");
  });
});
