import { describe, expect, it } from "vitest";

import { normalizeAssetForm } from "./validate";

describe("normalizeAssetForm", () => {
  it("requires asset_code and asset_name", () => {
    expect(normalizeAssetForm({ asset_name: "Excavator" }).error).toMatch(
      /asset code/i
    );
    expect(normalizeAssetForm({ asset_code: "EX-1" }).error).toMatch(/asset name/i);
    expect(
      normalizeAssetForm({ asset_code: "   ", asset_name: "x" }).error
    ).toMatch(/asset code/i);
  });

  it("trims and maps empty optionals to null", () => {
    const result = normalizeAssetForm({
      asset_code: "  EX-1  ",
      asset_name: "  Excavator  ",
      category: "",
      make: "  Kubota ",
    });
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      asset_code: "EX-1",
      asset_name: "Excavator",
      category: null,
      make: "Kubota",
      model: null,
      year: null,
    });
  });

  it("parses a valid year and rejects bad years", () => {
    expect(
      normalizeAssetForm({ asset_code: "a", asset_name: "b", year: "2022" }).value
        ?.year
    ).toBe(2022);
    expect(
      normalizeAssetForm({ asset_code: "a", asset_name: "b", year: "1800" }).error
    ).toMatch(/year/i);
    expect(
      normalizeAssetForm({ asset_code: "a", asset_name: "b", year: "20x2" }).error
    ).toMatch(/year/i);
  });

  it("validates the support email override when present", () => {
    expect(
      normalizeAssetForm({
        asset_code: "a",
        asset_name: "b",
        support_email_override: "not-an-email",
      }).error
    ).toMatch(/email/i);
    expect(
      normalizeAssetForm({
        asset_code: "a",
        asset_name: "b",
        support_email_override: "ops@example.com",
      }).value?.support_email_override
    ).toBe("ops@example.com");
  });

  it("never produces an organization_id field", () => {
    const result = normalizeAssetForm({
      asset_code: "a",
      asset_name: "b",
      organization_id: "attacker-supplied",
    } as Record<string, string>);
    expect(result.value).not.toHaveProperty("organization_id");
  });
});
