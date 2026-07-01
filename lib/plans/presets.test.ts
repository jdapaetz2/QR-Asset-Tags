import { describe, expect, it } from "vitest";

import { PLAN_PRESETS, getPlanPreset, isPlanKey, formatCents } from "./presets";

describe("plan presets", () => {
  it("exposes the five presets with the agreed Starter numbers", () => {
    expect(PLAN_PRESETS.map((p) => p.key)).toEqual([
      "starter",
      "standard",
      "pro",
      "scale",
      "custom",
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
