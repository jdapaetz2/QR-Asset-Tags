import { describe, expect, it } from "vitest";

import { PLAN_PRESETS, getPlanPreset, isDemoPlan, isPlanKey, formatCents } from "./presets";

describe("plan presets", () => {
  it("exposes the five commercial presets and the Demo plan, with the agreed Starter numbers", () => {
    expect(PLAN_PRESETS.map((p) => p.key)).toEqual([
      "starter",
      "standard",
      "pro",
      "scale",
      "custom",
      "demo",
    ]);
    expect(getPlanPreset("starter")).toMatchObject({
      covered_asset_limit: 25,
      intro_price_cents: 150000,
      renewal_price_cents: 240000,
      tag_credit_cents: 25000,
    });
  });

  it("custom carries no preset numbers", () => {
    expect(getPlanPreset("custom")).toMatchObject({
      covered_asset_limit: null,
      intro_price_cents: null,
    });
  });

  it("the Demo plan is never billed and marks a demonstration organization (Engineering Phase E2C)", () => {
    expect(getPlanPreset("demo")).toMatchObject({ covered_asset_limit: null, intro_price_cents: null, renewal_price_cents: null, tag_credit_cents: null });
    expect(isDemoPlan("demo")).toBe(true);
    expect(isDemoPlan("custom")).toBe(false);
    expect(isDemoPlan(null)).toBe(false);
  });

  it("validates plan keys and fails unknown keys safely", () => {
    expect(isPlanKey("pro")).toBe(true);
    expect(isPlanKey("enterprise")).toBe(false);
    expect(getPlanPreset("enterprise")).toBeNull();
  });

  it("formats CAD cents", () => {
    expect(formatCents(240000)).toBe("C$2,400");
    expect(formatCents(null)).toBe("—");
  });
});
