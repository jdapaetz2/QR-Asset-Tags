import { describe, expect, it } from "vitest";

import {
  brandedWarnings,
  clampLogoPercent,
  colorWarnings,
  contrastRatio,
  LOGO_MAX_BYTES,
  LOGO_MAX_PCT,
  normalizeBrandedEc,
  validateLogoFile,
} from "./branded";

describe("normalizeBrandedEc", () => {
  it("allows Q/H, defaults H, never L", () => {
    expect(normalizeBrandedEc("Q")).toBe("Q");
    expect(normalizeBrandedEc("H")).toBe("H");
    expect(normalizeBrandedEc("L")).toBe("H");
    expect(normalizeBrandedEc("M")).toBe("H");
    expect(normalizeBrandedEc(null)).toBe("H");
  });
});

describe("clampLogoPercent", () => {
  it("clamps to [0, max] and defaults sensibly", () => {
    expect(clampLogoPercent(50)).toBe(LOGO_MAX_PCT);
    expect(clampLogoPercent(-5)).toBe(0);
    expect(clampLogoPercent(12)).toBe(12);
    expect(clampLogoPercent(null)).toBe(15);
  });
});

describe("validateLogoFile", () => {
  it("rejects bad types and oversize", () => {
    expect(validateLogoFile({ type: "text/html", size: 1 })).toMatch(/PNG/i);
    expect(validateLogoFile({ type: "image/png", size: LOGO_MAX_BYTES + 1 })).toMatch(
      /2 MB/i
    );
    expect(validateLogoFile({ type: "image/svg+xml", size: 1000 })).toBeNull();
  });
});

describe("contrastRatio / colorWarnings", () => {
  it("computes black/white as maximum contrast", () => {
    expect(Math.round(contrastRatio("#000000", "#ffffff"))).toBe(21);
  });
  it("flags low contrast, inverted, and non-white background", () => {
    expect(colorWarnings("#000000", "#ffffff")).toEqual([]);
    expect(colorWarnings("#888888", "#999999").join(" ")).toMatch(/low contrast/i);
    expect(colorWarnings("#ffffff", "#000000").join(" ")).toMatch(/inverted/i);
    expect(colorWarnings("#000000", "#eeeeee").join(" ")).toMatch(/background/i);
  });
});

describe("brandedWarnings", () => {
  const base = {
    hasLogo: false,
    ec: "H",
    logoPct: 15,
    sizeInches: "2.0",
    baseIsProd: true,
    fg: "#000000",
    bg: "#ffffff",
  };

  it("is clean for a scan-safe-ish branded config", () => {
    expect(brandedWarnings(base)).toEqual([]);
  });

  it("warns about logo + EC below H, big logo, tiny size, and preview base", () => {
    expect(brandedWarnings({ ...base, hasLogo: true, ec: "Q" }).join(" ")).toMatch(
      /error correction H/i
    );
    expect(
      brandedWarnings({ ...base, hasLogo: true, logoPct: 18 }).join(" ")
    ).toMatch(/obscure|larger than/i);
    expect(
      brandedWarnings({ ...base, hasLogo: true, sizeInches: "1.5" }).join(" ")
    ).toMatch(/small physical size/i);
    expect(brandedWarnings({ ...base, baseIsProd: false }).join(" ")).toMatch(
      /localhost or a preview/i
    );
  });
});
