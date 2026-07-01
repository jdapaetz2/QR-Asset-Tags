import { describe, expect, it } from "vitest";

import { normalizePlanForm } from "./settings";

describe("normalizePlanForm", () => {
  it("accepts a valid plan with blanks → null and checkbox → bool", () => {
    const r = normalizePlanForm({
      plan_key: "standard",
      plan_name: "  Standard Yard ",
      billing_interval: "annual",
      asset_limit: "100",
      tag_credit_cents: "75000",
      video_uploads_enabled: "on",
      renewal_price_cents: "",
    });
    expect(r.value).toMatchObject({
      plan_key: "standard",
      plan_name: "Standard Yard",
      billing_interval: "annual",
      asset_limit: 100,
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

  it("rejects negative / non-integer numeric fields", () => {
    expect(normalizePlanForm({ asset_limit: "-5" }).error).toMatch(/whole number/i);
    expect(normalizePlanForm({ intro_price_cents: "12.5" }).error).toMatch(
      /whole number/i
    );
  });

  it("defaults video uploads off when the checkbox is absent", () => {
    expect(normalizePlanForm({}).value?.video_uploads_enabled).toBe(false);
  });
});
