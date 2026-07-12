import { describe, expect, it } from "vitest";

import { selectProductionLink } from "./production-data";
import { buildPublicQrUrl } from "./url";

describe("selectProductionLink", () => {
  it("prefers the production-primary active link", () => {
    const chosen = selectProductionLink([
      { short_code: "old", status: "active", is_production_primary: false },
      { short_code: "new", status: "active", is_production_primary: true },
    ]);
    expect(chosen?.short_code).toBe("new");
  });

  it("falls back to the first active link when none is primary", () => {
    const chosen = selectProductionLink([
      { short_code: "a", status: "active", is_production_primary: false },
      { short_code: "b", status: "active", is_production_primary: false },
    ]);
    expect(chosen?.short_code).toBe("a");
  });

  it("ignores a primary flag on a disabled link and picks an active one", () => {
    const chosen = selectProductionLink([
      { short_code: "dead", status: "disabled", is_production_primary: true },
      { short_code: "live", status: "active", is_production_primary: false },
    ]);
    expect(chosen?.short_code).toBe("live");
  });

  it("returns null when every link is disabled", () => {
    expect(
      selectProductionLink([
        { short_code: "x", status: "disabled", is_production_primary: false },
      ])
    ).toBeNull();
    expect(selectProductionLink([])).toBeNull();
  });

  it("the encoded production URL is computed from the base + short_code (never public_url)", () => {
    const chosen = selectProductionLink([
      { short_code: "meter-204", status: "active", is_production_primary: true },
    ]);
    expect(chosen).not.toBeNull();
    expect(buildPublicQrUrl("https://tags.example.com", chosen!.short_code)).toBe(
      "https://tags.example.com/t/meter-204"
    );
  });
});
