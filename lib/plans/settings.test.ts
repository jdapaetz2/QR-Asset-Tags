import { describe, expect, it } from "vitest";

import { normalizePlanForm } from "./settings";

describe("normalizePlanForm", () => {
  it("accepts a valid plan (dollars → cents), blanks → null, checkbox → bool", () => {
    const r = normalizePlanForm({
      plan_key: "standard",
      plan_name: "  Standard Yard ",
      billing_interval: "annual",
      asset_limit: "100",
      intro_price_cents: "$4,500",
      tag_credit_cents: "750",
      video_uploads_enabled: "on",
      renewal_price_cents: "",
    });
    expect(r.value).toMatchObject({
      plan_key: "standard",
      plan_name: "Standard Yard",
      billing_interval: "annual",
      asset_limit: 100,
      intro_price_cents: 450000,
      tag_credit_cents: 75000,
      renewal_price_cents: null,
      video_uploads_enabled: true,
    });
  });

  it("rejects an unknown plan key", () => {
    expect(normalizePlanForm({ plan_key: "enterprise" }).error).toMatch(/plan/i);
  });

  it("rejects a bad billing interval", () => {
    expect(normalizePlanForm({ billing_interval: "weekly" }).error).toMatch(
      /monthly or annual/i
    );
  });

  it("rejects a negative count field", () => {
    expect(normalizePlanForm({ asset_limit: "-5" }).error).toMatch(/whole number/i);
  });

  it("rejects an invalid dollar price", () => {
    expect(normalizePlanForm({ intro_price_cents: "abc" }).error).toMatch(
      /dollar amount/i
    );
    expect(normalizePlanForm({ tag_credit_cents: "-5" }).error).toMatch(
      /dollar amount/i
    );
  });

  it("defaults video uploads off when the checkbox is absent", () => {
    expect(normalizePlanForm({}).value?.video_uploads_enabled).toBe(false);
  });
});
