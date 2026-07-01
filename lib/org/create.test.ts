import { describe, expect, it } from "vitest";

import { normalizeNewOrg } from "./create";

describe("normalizeNewOrg", () => {
  it("requires a name", () => {
    expect(normalizeNewOrg({ name: "   " }).error).toMatch(/name is required/i);
  });

  it("derives a slug from the name when blank", () => {
    const r = normalizeNewOrg({ name: "Test Valley Rentals" });
    expect(r.value?.slug).toBe("test-valley-rentals");
    expect(r.value?.name).toBe("Test Valley Rentals");
    expect(r.value?.status).toBe("active");
  });

  it("accepts a valid explicit slug and rejects an invalid one", () => {
    expect(normalizeNewOrg({ name: "Acme", slug: "acme-yard" }).value?.slug).toBe(
      "acme-yard"
    );
    expect(normalizeNewOrg({ name: "Acme", slug: "Acme Yard" }).error).toMatch(
      /slug must be/i
    );
  });

  it("defaults status to active and validates the value", () => {
    expect(normalizeNewOrg({ name: "Acme" }).value?.status).toBe("active");
    expect(
      normalizeNewOrg({ name: "Acme", status: "suspended" }).value?.status
    ).toBe("suspended");
    expect(normalizeNewOrg({ name: "Acme", status: "deleted" }).error).toMatch(
      /active or suspended/i
    );
  });

  it("validates support email and primary color when present", () => {
    expect(
      normalizeNewOrg({ name: "Acme", support_email: "nope" }).error
    ).toMatch(/valid support email/i);
    expect(
      normalizeNewOrg({ name: "Acme", primary_color: "red" }).error
    ).toMatch(/hex/i);
    const ok = normalizeNewOrg({
      name: "Acme",
      support_email: "ops@acme.example",
      primary_color: "#1d4ed8",
    });
    expect(ok.value?.support_email).toBe("ops@acme.example");
    expect(ok.value?.primary_color).toBe("#1d4ed8");
  });

  it("merges plan preset numeric fields", () => {
    const r = normalizeNewOrg({
      name: "Acme",
      plan_key: "standard",
      plan_name: "Standard Yard",
      asset_limit: "100",
      tag_credit_cents: "75000",
    });
    expect(r.value?.plan_key).toBe("standard");
    expect(r.value?.asset_limit).toBe(100);
    expect(r.value?.tag_credit_cents).toBe(75000);
  });

  it("allows a custom plan with null limits", () => {
    const r = normalizeNewOrg({ name: "Acme", plan_key: "custom" });
    expect(r.value?.plan_key).toBe("custom");
    expect(r.value?.asset_limit).toBeNull();
  });

  it("rejects an unknown plan key", () => {
    expect(normalizeNewOrg({ name: "Acme", plan_key: "platinum" }).error).toMatch(
      /unknown plan/i
    );
  });
});
