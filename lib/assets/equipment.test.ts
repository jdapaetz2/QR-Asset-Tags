import { describe, expect, it } from "vitest";

import { normalizeEquipmentPageForm } from "./equipment";

describe("normalizeEquipmentPageForm", () => {
  it("trims text fields and maps empties to null", () => {
    const { value } = normalizeEquipmentPageForm({
      headline: "  Start here  ",
      quick_start_text: "   ",
      safety_notes: "Wear a seatbelt.",
    });
    expect(value.headline).toBe("Start here");
    expect(value.quick_start_text).toBeNull();
    expect(value.safety_notes).toBe("Wear a seatbelt.");
    expect(value.return_notes).toBeNull();
  });

  it("coerces the is_published checkbox", () => {
    expect(normalizeEquipmentPageForm({ is_published: "on" }).value.is_published).toBe(
      true
    );
    expect(
      normalizeEquipmentPageForm({ is_published: "true" }).value.is_published
    ).toBe(true);
    expect(normalizeEquipmentPageForm({}).value.is_published).toBe(false);
  });

  it("never produces organization_id or asset_id", () => {
    const { value } = normalizeEquipmentPageForm({
      asset_id: "attacker",
      organization_id: "attacker",
    } as Record<string, string>);
    expect(value).not.toHaveProperty("asset_id");
    expect(value).not.toHaveProperty("organization_id");
  });
});
