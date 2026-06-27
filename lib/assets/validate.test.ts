import { describe, expect, it } from "vitest";

import { isValidCoverImage, normalizeAssetForm } from "./validate";

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

  it("accepts a valid cover image and maps empty to null", () => {
    expect(
      normalizeAssetForm({
        asset_code: "a",
        asset_name: "b",
        cover_image_url: "https://cdn.example.com/excavator.jpg",
      }).value?.cover_image_url
    ).toBe("https://cdn.example.com/excavator.jpg");
    expect(
      normalizeAssetForm({
        asset_code: "a",
        asset_name: "b",
        cover_image_url: "/demo-assets/excavator-017.svg",
      }).value?.cover_image_url
    ).toBe("/demo-assets/excavator-017.svg");
    expect(
      normalizeAssetForm({ asset_code: "a", asset_name: "b", cover_image_url: "  " })
        .value?.cover_image_url
    ).toBeNull();
  });

  it("rejects unsafe or non-image-URL cover values", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "ftp://example.com/x.png",
      "/etc/passwd",
      "/demo-assets/../secret.svg",
      "relative/path.png",
    ]) {
      expect(
        normalizeAssetForm({ asset_code: "a", asset_name: "b", cover_image_url: bad })
          .error
      ).toMatch(/cover image/i);
    }
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

describe("isValidCoverImage", () => {
  it("accepts http(s) URLs and /demo-assets/ paths", () => {
    expect(isValidCoverImage("https://cdn.example.com/a.jpg")).toBe(true);
    expect(isValidCoverImage("http://example.com/a.png")).toBe(true);
    expect(isValidCoverImage("/demo-assets/trailer-014.svg")).toBe(true);
  });

  it("rejects other schemes, traversal, and relative paths", () => {
    expect(isValidCoverImage("javascript:alert(1)")).toBe(false);
    expect(isValidCoverImage("data:image/png;base64,AAAA")).toBe(false);
    expect(isValidCoverImage("ftp://example.com/x")).toBe(false);
    expect(isValidCoverImage("/demo-assets/../secret.svg")).toBe(false);
    expect(isValidCoverImage("/uploads/x.png")).toBe(false);
    expect(isValidCoverImage("relative.png")).toBe(false);
  });
});
