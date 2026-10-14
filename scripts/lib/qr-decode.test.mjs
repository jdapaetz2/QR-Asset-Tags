import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import QRCode from "qrcode";
import AlignmentPattern from "qrcode/lib/core/alignment-pattern.js";
import ECCode from "qrcode/lib/core/error-correction-code.js";
import ECLevel from "qrcode/lib/core/error-correction-level.js";
import FormatInfo from "qrcode/lib/core/format-info.js";
import QrMode from "qrcode/lib/core/mode.js";
import QrUtils from "qrcode/lib/core/utils.js";
import QrVersion from "qrcode/lib/core/version.js";
import { describe, expect, it } from "vitest";

import { buildQrSheetSvg, buildQrSvg } from "../../lib/qr/svg.ts";
import {
  EC_LEVELS,
  QrDecodeError,
  alignmentCoords,
  blockLayout,
  decodeMatrix,
  decodeSvg,
  declaredLabels,
  extractModuleGrids,
  formatBits,
  isLightColor,
  matrixHashVariants,
  matrixSha256,
  parseSegments,
  versionBits,
} from "./qr-decode.mjs";

// The Phase E0 vector QR decoder (scripts/lib/qr-decode.mjs). Every expectation is checked against the `qrcode`
// package the app prints tags with, so the decoder cannot drift from the encoder unnoticed.

const URL_017 = "https://mulemark.io/t/demo-ex017";

function toMatrix(qr) {
  const { size } = qr.modules;
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => Boolean(qr.modules.get(r, c))));
}

const encode = (data, options) => toMatrix(QRCode.create(data, options));

function flip(modules, ...cells) {
  const out = modules.map((row) => [...row]);
  for (const [row, col] of cells) out[row][col] = !out[row][col];
  return out;
}

/** The marketing site's format: one `M x y h1v1h-1z` square per dark module inside a scaled group. */
function rectSvg(modules, { title = URL_017, aria = "QR code for EXCAVATOR-017", fill } = {}) {
  const n = modules.length + 8;
  let d = "";
  modules.forEach((row, r) => row.forEach((dark, c) => (d += dark ? `M${c + 4} ${r + 4}h1v1h-1z` : "")));
  const fillAttr = fill ? ` fill="${fill}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n * 10}" height="${n * 10}" viewBox="0 0 ${n * 10} ${n * 10}" ` +
    `role="img" aria-label="${aria}"><title>${title}</title><g transform="translate(0 0) scale(10.0000000000)">` +
    `<rect width="${n}" height="${n}" fill="#FAF9F6"/><path${fillAttr} d="${d}"/></g></svg>`
  );
}

/** Packs [value, bitLength] fields into codewords, zero-padded to a byte boundary. */
function packBits(...fields) {
  const bits = [];
  for (const [value, length] of fields) for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  while (bits.length % 8) bits.push(0);
  const bytes = new Uint8Array(bits.length / 8);
  bits.forEach((bit, i) => {
    if (bit) bytes[i >> 3] |= 1 << (7 - (i & 7));
  });
  return bytes;
}

describe("standard tables and codes", () => {
  it("matches qrcode's codeword and block tables for every version and level", () => {
    for (let version = 1; version <= 40; version++) {
      for (const level of EC_LEVELS) {
        const layout = blockLayout(version, level);
        expect(layout.total).toBe(QrUtils.getSymbolTotalCodewords(version));
        expect(layout.blocks).toBe(ECCode.getBlocksCount(version, ECLevel[level]));
        expect(layout.ecTotal).toBe(ECCode.getTotalCodewordsCount(version, ECLevel[level]));
        const dataTotal = layout.sizes.reduce((sum, s) => sum + s, 0);
        expect(dataTotal + layout.blocks * layout.ecCount).toBe(layout.total);
      }
    }
  });

  it("matches qrcode's alignment coordinates, format bits and version bits", () => {
    for (let version = 1; version <= 40; version++) {
      expect(alignmentCoords(version)).toEqual(AlignmentPattern.getRowColCoords(version));
      if (version >= 7) expect(versionBits(version)).toBe(QrVersion.getEncodedBits(version));
    }
    for (const level of EC_LEVELS) {
      for (let mask = 0; mask < 8; mask++) expect(formatBits(level, mask)).toBe(FormatInfo.getEncodedBits(ECLevel[level], mask));
    }
  });
});

describe("decodeMatrix — round trips through the app's encoder", () => {
  it("decodes versions 1–10 at every level with every forced mask", () => {
    for (let version = 1; version <= 10; version++) {
      for (const level of EC_LEVELS) {
        for (let mask = 0; mask < 8; mask++) {
          const text = `v${version}${level}m${mask}`;
          const result = decodeMatrix(encode(text, { version, errorCorrectionLevel: level, maskPattern: mask }));
          expect(result).toMatchObject({ ok: true, text, version, ecc: level, mask, warnings: [] });
        }
      }
    }
  });

  it("decodes a byte payload filled to capacity (every codeword carries data)", () => {
    const filler = "mulemark-demo-tag/".repeat(40);
    for (let version = 1; version <= 10; version++) {
      for (const level of EC_LEVELS) {
        const text = filler.slice(0, QrVersion.getCapacity(version, ECLevel[level], QrMode.BYTE));
        const result = decodeMatrix(encode(text, { version, errorCorrectionLevel: level }));
        expect(result).toMatchObject({ ok: true, text, version, ecc: level });
      }
    }
  });

  it("reads version information on large symbols", () => {
    for (const version of [7, 20, 40]) {
      for (const level of EC_LEVELS) {
        const result = decodeMatrix(encode(URL_017, { version, errorCorrectionLevel: level }));
        expect(result).toMatchObject({ ok: true, text: URL_017, version, size: version * 4 + 17, ecc: level });
      }
    }
  });

  it("parses numeric runs, including two- and one-digit remainders", () => {
    for (const digits of ["7", "12", "123", "1234", "12345", "0123456789012345678901234567890123456789"]) {
      const result = decodeMatrix(encode([{ data: digits, mode: "numeric" }], { errorCorrectionLevel: "Q" }));
      expect(result).toMatchObject({ ok: true, text: digits, segments: [{ mode: "numeric", length: digits.length }] });
    }
  });

  it("parses alphanumeric runs, odd and even length", () => {
    for (const chars of ["A", "AB", "ABC", "HTTPS://MULEMARK.IO/T/DEMO-EX017", "$%*+-./: 09"]) {
      const result = decodeMatrix(encode([{ data: chars, mode: "alphanumeric" }], { errorCorrectionLevel: "M" }));
      expect(result).toMatchObject({ ok: true, text: chars, segments: [{ mode: "alphanumeric", length: chars.length }] });
    }
  });

  it("joins mixed segments in order", () => {
    const segments = [
      { data: "0123456789", mode: "numeric" },
      { data: "MULEMARK", mode: "alphanumeric" },
      { data: "/t/demo", mode: "byte" },
    ];
    const result = decodeMatrix(encode(segments, { errorCorrectionLevel: "H" }));
    expect(result.ok).toBe(true);
    expect(result.text).toBe("0123456789MULEMARK/t/demo");
    expect(result.segments.map((s) => s.mode)).toEqual(["numeric", "alphanumeric", "byte"]);
  });

  it("decodes whatever segmentation the encoder's optimiser chooses", () => {
    const text = "ORDER 0012345678901234 shipped to YARD-7";
    expect(decodeMatrix(encode(text, { errorCorrectionLevel: "M" }))).toMatchObject({ ok: true, text });
  });

  it("decodes UTF-8 byte payloads and falls back to ISO-8859-1 for bytes that are not UTF-8", () => {
    const utf8 = decodeMatrix(encode("Équipement – 017 ✓", { errorCorrectionLevel: "M" }));
    expect(utf8).toMatchObject({ ok: true, text: "Équipement – 017 ✓" });
    expect(utf8.segments.find((s) => s.mode === "byte").charset).toBe("utf-8");

    const latin1 = decodeMatrix(encode([{ data: new Uint8Array([0x63, 0x61, 0x66, 0xe9]), mode: "byte" }]));
    expect(latin1).toMatchObject({ ok: true, text: "café", segments: [{ mode: "byte", charset: "iso-8859-1" }] });
  });
});

describe("decodeMatrix — damage is reported, never repaired into a guess", () => {
  const clean = encode(URL_017, { errorCorrectionLevel: "M" });
  const size = clean.length;

  it("rejects a single flipped data module", () => {
    const result = decodeMatrix(flip(clean, [size - 1, size - 1]));
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/Reed-Solomon check failed/) });
  });

  it("rejects a damaged finder pattern", () => {
    expect(decodeMatrix(flip(clean, [3, 3]))).toEqual({ ok: false, reason: expect.stringMatching(/finder patterns/) });
  });

  it("accepts one damaged format copy with a warning, and rejects two", () => {
    const one = decodeMatrix(flip(clean, [8, size - 1]));
    expect(one).toMatchObject({ ok: true, text: URL_017 });
    expect(one.warnings).toEqual([expect.stringMatching(/format-information copy is damaged/)]);
    const both = decodeMatrix(flip(clean, [8, size - 1], [0, 8]));
    expect(both).toEqual({ ok: false, reason: expect.stringMatching(/format information is not a valid codeword/) });
  });

  it("accepts one damaged version copy with a warning, and rejects two", () => {
    const v7 = encode(URL_017, { version: 7, errorCorrectionLevel: "M" });
    const n = v7.length;
    const one = decodeMatrix(flip(v7, [0, n - 11]));
    expect(one).toMatchObject({ ok: true, text: URL_017 });
    expect(one.warnings).toEqual([expect.stringMatching(/version-information copy is damaged/)]);
    const both = decodeMatrix(flip(v7, [0, n - 11], [n - 11, 0]));
    expect(both).toEqual({ ok: false, reason: expect.stringMatching(/version information does not match/) });
  });

  it("rejects grids that are not QR symbol sizes", () => {
    expect(decodeMatrix([])).toMatchObject({ ok: false });
    expect(decodeMatrix(Array.from({ length: 22 }, () => new Array(22).fill(false)))).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not a QR symbol size/),
    });
  });
});

describe("parseSegments", () => {
  it("honours an ECI 26 (UTF-8) designator", () => {
    const bytes = packBits([7, 4], [26, 8], [4, 4], [2, 8], [0xc3, 8], [0xa9, 8], [0, 4]);
    expect(parseSegments(bytes, 1)).toEqual({
      text: "é",
      segments: [
        { mode: "eci", designator: 26 },
        { mode: "byte", length: 2, charset: "utf-8" },
      ],
    });
  });

  it("refuses an ECI 26 payload that is not UTF-8, and unsupported designators", () => {
    expect(() => parseSegments(packBits([7, 4], [26, 8], [4, 4], [1, 8], [0xe9, 8]), 1)).toThrow(QrDecodeError);
    expect(() => parseSegments(packBits([7, 4], [20, 8], [4, 4], [1, 8], [0x41, 8]), 1)).toThrow(/unsupported ECI/);
  });

  it("refuses Kanji, structured append and FNC1 explicitly", () => {
    expect(() => parseSegments(packBits([8, 4], [1, 8], [0, 13]), 1)).toThrow(/Kanji/);
    expect(() => parseSegments(packBits([3, 4], [0, 16]), 1)).toThrow(/structured append/);
    expect(() => parseSegments(packBits([5, 4], [0, 8]), 1)).toThrow(/FNC1/);
    expect(() => parseSegments(packBits([9, 4], [0, 8]), 1)).toThrow(/FNC1/);
    expect(() => parseSegments(packBits([6, 4], [0, 8]), 1)).toThrow(/unknown segment mode 6/);
  });

  it("refuses truncated segments and impossible numeric groups", () => {
    expect(() => parseSegments(packBits([4, 4], [5, 8], [0x41, 8]), 1)).toThrow(/ends inside a segment/);
    expect(() => parseSegments(packBits([1, 4], [3, 10], [1000, 10]), 1)).toThrow(/invalid numeric group/);
  });

  it("uses the longer character-count fields from version 10 and version 27", () => {
    expect(parseSegments(packBits([4, 4], [1, 16], [0x41, 8], [0, 4]), 10).text).toBe("A");
    expect(parseSegments(packBits([1, 4], [1, 14], [7, 4], [0, 4]), 27).text).toBe("7");
  });
});

describe("SVG artwork", () => {
  it("decodes the app's own export (qrcode stroke runs) to the same matrix as the encoder", async () => {
    const svg = await QRCode.toString(URL_017, { type: "svg", errorCorrectionLevel: "H", margin: 4 });
    const [grid, ...rest] = decodeSvg(svg);
    expect(rest).toEqual([]);
    expect(grid).toMatchObject({ format: "stroke-runs", offset: [4, 4], result: { ok: true, text: URL_017, ecc: "H" } });
    expect(grid.matrixSha256).toBe(matrixSha256(encode(URL_017, { errorCorrectionLevel: "H" })));
  });

  it("decodes every code on an app QR sheet and keeps each visible label with its code", async () => {
    const svg = await buildQrSheetSvg([
      { label: "EXCAVATOR-017", url: URL_017 },
      { label: "TRAILER-014", url: "https://mulemark.io/t/demo-tr014" },
      { label: "SHEET-3", url: "https://example.test/t/sheet-3" },
    ]);
    const decoded = decodeSvg(svg).map((g) => [g.label, g.result.ok && g.result.text, g.result.warnings]);
    expect(decoded).toEqual([
      ["EXCAVATOR-017", URL_017, []],
      ["TRAILER-014", "https://mulemark.io/t/demo-tr014", []],
      ["SHEET-3", "https://example.test/t/sheet-3", []],
    ]);
  });

  it("decodes a branded export from its module path and warns that a logo is drawn over it", async () => {
    const svg = await buildQrSvg(URL_017, { logo: { dataUri: "data:image/png;base64,iVBORw0KGgo=", pct: 15 } });
    const [grid] = decodeSvg(svg);
    expect(grid.result).toMatchObject({ ok: true, text: URL_017 });
    expect(grid.result.warnings).toEqual([expect.stringMatching(/drawn over the module grid/)]);
  });

  it("decodes the marketing site's unit-square format and reports the file's own claims separately", () => {
    const modules = encode(URL_017, { version: 4, errorCorrectionLevel: "M" });
    const svg = rectSvg(modules, { title: "https://mulemark.io/t/something-else" });
    const [grid] = decodeSvg(svg);
    expect(grid).toMatchObject({ format: "unit-squares", offset: [4, 4], result: { ok: true, text: URL_017, version: 4 } });
    expect(declaredLabels(svg)).toEqual({ title: "https://mulemark.io/t/something-else", ariaLabel: "QR code for EXCAVATOR-017" });
  });

  it("ignores logo curves, plates and light-coloured module paths", () => {
    const modules = encode(URL_017, { errorCorrectionLevel: "Q" });
    const logo = `<path fill="#1A1917" d="M10 10Q12 4 20 10A4 4 0 0 1 24 14L30 20H10V12Z"/>`;
    const tag = rectSvg(modules).replace("</g></svg>", `</g>${logo}<rect x="1" y="1" width="9" height="9"/></svg>`);
    expect(decodeSvg(tag).map((g) => g.result.ok && g.result.text)).toEqual([URL_017]);
    expect(extractModuleGrids(rectSvg(modules, { fill: "#FAF9F6" }))).toEqual([]);
  });

  it("does not read absolute H/V commands as unit squares", () => {
    const modules = encode(URL_017, { errorCorrectionLevel: "M" });
    const absolute = rectSvg(modules).replace(/h1v1h-1z/g, "H1V1H-1Z");
    expect(extractModuleGrids(absolute)).toEqual([]);
  });

  it("classifies light and dark colours", () => {
    for (const light of ["#fff", "#FFFFFF", "white", "#FAF9F6", "none"]) expect(isLightColor(light)).toBe(true);
    for (const dark of ["#000", "#1A1917", "#57534B", "black", "currentColor", undefined]) expect(isLightColor(dark)).toBe(false);
  });
});

describe("matrix hashes", () => {
  it("hashes rows of 1 (dark) and 0 joined by newlines", () => {
    const grid = [
      [true, false],
      [false, true],
    ];
    expect(matrixSha256(grid)).toBe(createHash("sha256").update("10\n01").digest("hex"));
  });

  it("offers each comparison variant with and without a four-module quiet zone", () => {
    const variants = matrixHashVariants(encode(URL_017, { version: 4, errorCorrectionLevel: "M" }));
    expect(Object.keys(variants)).toHaveLength(20);
    expect(new Set(Object.values(variants)).size).toBe(20);
  });
});

describe("never fetches", () => {
  it("the decoder and its CLI import no network module and make no request", () => {
    for (const file of ["./qr-decode.mjs", "../phase-e/decode-qr-svg.mjs"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/["'](node:)?(http|https|http2|net|tls|dgram|undici)["']/);
    }
  });
});
