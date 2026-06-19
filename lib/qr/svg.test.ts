import { describe, expect, it } from "vitest";

import {
  buildQrSheetSvg,
  buildQrSvg,
  normalizeErrorCorrection,
  QUIET_ZONE,
  sanitizeSvgFilename,
  svgWidthForSize,
} from "./svg";
import { buildPublicQrUrl } from "./url";

describe("normalizeErrorCorrection", () => {
  it("defaults to H and rejects L / invalid", () => {
    expect(normalizeErrorCorrection(null)).toBe("H");
    expect(normalizeErrorCorrection("L")).toBe("H");
    expect(normalizeErrorCorrection("nonsense")).toBe("H");
  });
  it("passes through M/Q/H", () => {
    expect(normalizeErrorCorrection("M")).toBe("M");
    expect(normalizeErrorCorrection("Q")).toBe("Q");
    expect(normalizeErrorCorrection("H")).toBe("H");
  });
});

describe("svgWidthForSize", () => {
  it("maps inch options and defaults to 2.0in", () => {
    expect(svgWidthForSize("1.5")).toBe(384);
    expect(svgWidthForSize("2.5")).toBe(640);
    expect(svgWidthForSize(null)).toBe(512);
    expect(svgWidthForSize("9")).toBe(512);
  });
});

describe("sanitizeSvgFilename", () => {
  it("produces a safe filename", () => {
    expect(sanitizeSvgFilename("EXCAVATOR-017", "demo-ex017")).toBe(
      "excavator-017-demo-ex017.svg"
    );
    expect(sanitizeSvgFilename("a/b c", "x..y")).toBe("a-b-c-x-y.svg");
  });
});

describe("quiet zone", () => {
  it("is at least 4 modules", () => {
    expect(QUIET_ZONE).toBeGreaterThanOrEqual(4);
  });
});

describe("buildQrSvg", () => {
  it("returns SVG markup and never the stale placeholder host", async () => {
    const url = buildPublicQrUrl("https://tags.example.com", "demo-ex017");
    const svg = await buildQrSvg(url);
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("app.example.com");
    // computed URL is /t/<short>, never the stored public_url
    expect(url).toBe("https://tags.example.com/t/demo-ex017");
  });

  it("encodes with the requested error correction without throwing", async () => {
    await expect(
      buildQrSvg("https://tags.example.com/t/x", { ec: "M", size: "1.5" })
    ).resolves.toContain("<svg");
  });

  it("embeds a centered logo as a self-contained image when provided", async () => {
    const svg = await buildQrSvg("https://tags.example.com/t/demo-ex017", {
      ec: "H",
      logo: { dataUri: "data:image/png;base64,AAAA", pct: 15 },
    });
    expect(svg).toContain("<image");
    expect(svg).toContain("data:image/png;base64,AAAA");
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).not.toContain("app.example.com");
  });

  it("does not add an image when no logo is given", async () => {
    const svg = await buildQrSvg("https://tags.example.com/t/x", { ec: "H" });
    expect(svg).not.toContain("<image");
  });
});

describe("buildQrSheetSvg", () => {
  it("combines multiple QR codes into one SVG with labels", async () => {
    const svg = await buildQrSheetSvg([
      { label: "EXCAVATOR-017", url: "https://tags.example.com/t/demo-ex017" },
      { label: "TRAILER-014", url: "https://tags.example.com/t/demo-tr014" },
    ]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect((svg.match(/<svg/g) ?? []).length).toBeGreaterThan(1);
    expect(svg).toContain("EXCAVATOR-017");
    expect(svg).not.toContain("app.example.com");
  });
});
