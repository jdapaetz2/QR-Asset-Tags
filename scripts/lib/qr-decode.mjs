/**
 * Engineering Phase E0 — a deterministic QR decoder for VECTOR artwork (SVG module grids). Pure: no I/O, no network,
 * no dependency.
 *
 * Why: published and printed QR artwork must be decoded, never trusted by its label, file name or <title>
 * (docs/phase-e/PROTECTED_DEMO_ROUTES.md). Vector art is an exact module grid, so no image processing is involved: the
 * grid is read, every Reed-Solomon block is VERIFIED by recomputing its check codewords, and the payload is parsed.
 * Nothing is "repaired" into a guess — any mismatch is reported as undecodable. Raster art, and art whose logo is
 * knocked out of the modules, is out of scope: use a phone scan for those.
 *
 * Supported: versions 1–40, every error-correction level and mask, numeric / alphanumeric / byte / ECI segments.
 * Refused explicitly: Kanji, structured append, FNC1.
 *
 * Placement mirrors the ISO/IEC 18004 symbol layout exactly as the `qrcode` package the app uses writes it
 * (node_modules/qrcode/lib/core/qrcode.js: setupFinderPattern, setupTimingPattern, setupAlignmentPattern,
 * setupFormatInfo, setupVersionInfo, setupData, createCodewords). The block tables below are the standard values
 * (identical to qrcode's utils.js and error-correction-code.js, MIT). scripts/lib/qr-decode.test.mjs round-trips that
 * encoder across versions, levels and masks.
 */
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------------------------------------------------
// Standard tables
// ---------------------------------------------------------------------------------------------------------------------

/** Total codewords (data + error correction) per version, index = version. */
const CODEWORDS_COUNT = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085, 1156, 1258,
  1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
];

/** Error-correction blocks per version, columns L M Q H. */
const EC_BLOCKS_TABLE = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 4, 1, 2, 4, 4, 2, 4, 4, 4, 2, 4, 6, 5, 2, 4, 6, 6, 2, 5, 8, 8, 4, 5, 8, 8,
  4, 5, 8, 11, 4, 8, 10, 11, 4, 9, 12, 16, 4, 9, 16, 16, 6, 10, 12, 18, 6, 10, 17, 16, 6, 11, 16, 19, 6, 13, 18, 21, 7,
  14, 21, 25, 8, 16, 20, 25, 8, 17, 23, 25, 9, 17, 23, 34, 9, 18, 25, 30, 10, 20, 27, 32, 12, 21, 29, 35, 12, 23, 34,
  37, 12, 25, 34, 40, 13, 26, 35, 42, 14, 28, 38, 45, 15, 29, 40, 48, 16, 31, 43, 51, 17, 33, 45, 54, 18, 35, 48, 57,
  19, 37, 51, 60, 19, 38, 53, 63, 20, 40, 56, 66, 21, 43, 59, 70, 22, 45, 62, 74, 24, 47, 65, 77, 25, 49, 68, 81,
];

/** Total error-correction codewords per version, columns L M Q H. */
const EC_CODEWORDS_TABLE = [
  7, 10, 13, 17, 10, 16, 22, 28, 15, 26, 36, 44, 20, 36, 52, 64, 26, 48, 72, 88, 36, 64, 96, 112, 40, 72, 108, 130, 48,
  88, 132, 156, 60, 110, 160, 192, 72, 130, 192, 224, 80, 150, 224, 264, 96, 176, 260, 308, 104, 198, 288, 352, 120,
  216, 320, 384, 132, 240, 360, 432, 144, 280, 408, 480, 168, 308, 448, 532, 180, 338, 504, 588, 196, 364, 546, 650,
  224, 416, 600, 700, 224, 442, 644, 750, 252, 476, 690, 816, 270, 504, 750, 900, 300, 560, 810, 960, 312, 588, 870,
  1050, 336, 644, 952, 1110, 360, 700, 1020, 1200, 390, 728, 1050, 1260, 420, 784, 1140, 1350, 450, 812, 1200, 1440,
  480, 868, 1290, 1530, 510, 924, 1350, 1620, 540, 980, 1440, 1710, 570, 1036, 1530, 1800, 570, 1064, 1590, 1890, 600,
  1120, 1680, 1980, 630, 1204, 1770, 2100, 660, 1260, 1860, 2220, 720, 1316, 1950, 2310, 750, 1372, 2040, 2430,
];

/** Table column order. */
export const EC_LEVELS = /** @type {const} */ (["L", "M", "Q", "H"]);

/** The two error-correction bits carried in the format information. */
const FORMAT_EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/** Character-count indicator lengths for versions 1–9, 10–26 and 27–40. */
const CHAR_COUNT_BITS = { numeric: [10, 12, 14], alphanumeric: [9, 11, 13], byte: [8, 16, 16] };

// ---------------------------------------------------------------------------------------------------------------------
// GF(256), Reed-Solomon and BCH
// ---------------------------------------------------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function polyMul(p1, p2) {
  const out = new Uint8Array(p1.length + p2.length - 1);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) out[i + j] ^= gfMul(p1[i], p2[j]);
  }
  return out;
}

function polyMod(dividend, divisor) {
  let result = new Uint8Array(dividend);
  while (result.length - divisor.length >= 0) {
    const coeff = result[0];
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], coeff);
    let offset = 0;
    while (offset < result.length && result[offset] === 0) offset++;
    result = result.slice(offset);
  }
  return result;
}

const generators = new Map();
function generator(degree) {
  if (!generators.has(degree)) {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) poly = polyMul(poly, new Uint8Array([1, EXP[i]]));
    generators.set(degree, poly);
  }
  return generators.get(degree);
}

/** The Reed-Solomon check codewords a data block must carry. */
export function reedSolomonCheck(data, ecCount) {
  const padded = new Uint8Array(data.length + ecCount);
  padded.set(data);
  const remainder = polyMod(padded, generator(ecCount));
  const out = new Uint8Array(ecCount);
  out.set(remainder, ecCount - remainder.length);
  return out;
}

function bchDigit(n) {
  let digit = 0;
  while (n !== 0) {
    digit++;
    n >>>= 1;
  }
  return digit;
}

const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
const G15_BCH = bchDigit(G15);
const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
const G18_BCH = bchDigit(G18);

/** The 15-bit format information for a level and mask. */
export function formatBits(level, mask) {
  const data = (FORMAT_EC_BITS[level] << 3) | mask;
  let d = data << 10;
  while (bchDigit(d) - G15_BCH >= 0) d ^= G15 << (bchDigit(d) - G15_BCH);
  return ((data << 10) | d) ^ G15_MASK;
}

/** The 18-bit version information (versions 7–40). */
export function versionBits(version) {
  let d = version << 12;
  while (bchDigit(d) - G18_BCH >= 0) d ^= G18 << (bchDigit(d) - G18_BCH);
  return (version << 12) | d;
}

// ---------------------------------------------------------------------------------------------------------------------
// Symbol layout
// ---------------------------------------------------------------------------------------------------------------------

export class QrDecodeError extends Error {}

const symbolSize = (version) => version * 4 + 17;

/** Alignment-pattern centre coordinates for a version. */
export function alignmentCoords(version) {
  if (version === 1) return [];
  const posCount = Math.floor(version / 7) + 2;
  const size = symbolSize(version);
  const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
  const positions = [size - 7];
  for (let i = 1; i < posCount - 1; i++) positions[i] = positions[i - 1] - intervals;
  positions.push(6);
  return positions.reverse();
}

function alignmentPositions(version) {
  const coords = alignmentCoords(version);
  const last = coords.length - 1;
  const out = [];
  for (let i = 0; i < coords.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      out.push([coords[i], coords[j]]);
    }
  }
  return out;
}

/** Where format bit i lives in each of the two copies, as written by setupFormatInfo. */
function formatPositions(size) {
  const vertical = [];
  const horizontal = [];
  for (let i = 0; i < 15; i++) {
    vertical.push(i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : [size - 15 + i, 8]);
    horizontal.push(i < 8 ? [8, size - i - 1] : i < 9 ? [8, 15 - i] : [8, 15 - i - 1]);
  }
  return [vertical, horizontal];
}

/** Where version bit i lives in each copy, as written by setupVersionInfo. */
function versionPositions(size) {
  const first = [];
  const second = [];
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 3);
    const col = (i % 3) + size - 11;
    first.push([row, col]);
    second.push([col, row]);
  }
  return [first, second];
}

/** Modules that never carry data (function patterns, format and version areas). */
function reservedMap(version) {
  const size = symbolSize(version);
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));
  const mark = (row, col) => {
    if (row >= 0 && row < size && col >= 0 && col < size) reserved[row][col] = 1;
  };
  for (const [row, col] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) mark(row + r, col + c);
  }
  for (let i = 8; i < size - 8; i++) {
    mark(i, 6);
    mark(6, i);
  }
  for (const [row, col] of alignmentPositions(version)) {
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) mark(row + r, col + c);
  }
  for (const copy of formatPositions(size)) for (const [row, col] of copy) mark(row, col);
  mark(size - 8, 8);
  if (version >= 7) for (const copy of versionPositions(size)) for (const [row, col] of copy) mark(row, col);
  return reserved;
}

function maskAt(mask, i, j) {
  switch (mask) {
    case 0:
      return (i + j) % 2 === 0;
    case 1:
      return i % 2 === 0;
    case 2:
      return j % 3 === 0;
    case 3:
      return (i + j) % 3 === 0;
    case 4:
      return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5:
      return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6:
      return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case 7:
      return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    default:
      throw new QrDecodeError(`bad mask ${mask}`);
  }
}

function finderAt(modules, row0, col0) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const ring = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      if (modules[row0 + r][col0 + c] !== (ring || core)) return false;
    }
  }
  return true;
}

/** True when all three finder patterns are exact. */
export function hasFinderPatterns(modules) {
  const size = modules.length;
  return finderAt(modules, 0, 0) && finderAt(modules, 0, size - 7) && finderAt(modules, size - 7, 0);
}

function readCodewords(modules, reserved, mask, total) {
  const size = modules.length;
  const bytes = new Uint8Array(total);
  let byteIndex = 0;
  let bitIndex = 7;
  let row = size - 1;
  let inc = -1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    while (true) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (!reserved[row][cc]) {
          if (byteIndex < total) {
            const bit = (modules[row][cc] ? 1 : 0) ^ (maskAt(mask, row, cc) ? 1 : 0);
            if (bit) bytes[byteIndex] |= 1 << bitIndex;
          }
          bitIndex--;
          if (bitIndex === -1) {
            byteIndex++;
            bitIndex = 7;
          }
        }
      }
      row += inc;
      if (row < 0 || size <= row) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }
  return bytes;
}

/** Codeword and block structure for a version and level (the split createCodewords uses). */
export function blockLayout(version, level) {
  const column = EC_LEVELS.indexOf(level);
  const blocks = EC_BLOCKS_TABLE[(version - 1) * 4 + column];
  const ecTotal = EC_CODEWORDS_TABLE[(version - 1) * 4 + column];
  const total = CODEWORDS_COUNT[version];
  const dataTotal = total - ecTotal;
  const group2 = total % blocks;
  const group1 = blocks - group2;
  const dataGroup1 = Math.floor(dataTotal / blocks);
  const ecCount = Math.floor(total / blocks) - dataGroup1;
  const sizes = Array.from({ length: blocks }, (_, b) => (b < group1 ? dataGroup1 : dataGroup1 + 1));
  return { total, blocks, ecTotal, ecCount, sizes };
}

// ---------------------------------------------------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------------------------------------------------

function decodeBytes(bytes, eci) {
  if (eci === null || eci === 26) {
    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), charset: "utf-8" };
    } catch {
      if (eci === 26) throw new QrDecodeError("ECI 26 declares UTF-8 but the bytes are not valid UTF-8");
    }
  }
  if (eci === null || eci === 3 || eci === 1) {
    return { text: Array.from(bytes, (b) => String.fromCharCode(b)).join(""), charset: "iso-8859-1" };
  }
  throw new QrDecodeError(`unsupported ECI designator ${eci}`);
}

/**
 * Parse the data codewords into segments. Throws QrDecodeError for anything it will not interpret with certainty.
 */
export function parseSegments(bytes, version) {
  const totalBits = bytes.length * 8;
  const ccIndex = version < 10 ? 0 : version < 27 ? 1 : 2;
  let pos = 0;
  const read = (n) => {
    if (pos + n > totalBits) throw new QrDecodeError("the payload ends inside a segment");
    let value = 0;
    for (let i = 0; i < n; i++) {
      const bit = (bytes[(pos + i) >> 3] >> (7 - ((pos + i) & 7))) & 1;
      value = value * 2 + bit;
    }
    pos += n;
    return value;
  };

  const segments = [];
  const parts = [];
  let eci = null;
  while (totalBits - pos >= 4) {
    const mode = read(4);
    if (mode === 0) break;
    if (mode === 1) {
      let count = read(CHAR_COUNT_BITS.numeric[ccIndex]);
      const length = count;
      let digits = "";
      while (count >= 3) {
        const v = read(10);
        if (v > 999) throw new QrDecodeError("invalid numeric group");
        digits += String(v).padStart(3, "0");
        count -= 3;
      }
      if (count === 2) {
        const v = read(7);
        if (v > 99) throw new QrDecodeError("invalid numeric group");
        digits += String(v).padStart(2, "0");
      } else if (count === 1) {
        const v = read(4);
        if (v > 9) throw new QrDecodeError("invalid numeric group");
        digits += String(v);
      }
      segments.push({ mode: "numeric", length });
      parts.push(digits);
    } else if (mode === 2) {
      let count = read(CHAR_COUNT_BITS.alphanumeric[ccIndex]);
      const length = count;
      let chars = "";
      while (count >= 2) {
        const v = read(11);
        const a = Math.floor(v / 45);
        const b = v % 45;
        if (a >= 45) throw new QrDecodeError("invalid alphanumeric pair");
        chars += ALPHANUMERIC[a] + ALPHANUMERIC[b];
        count -= 2;
      }
      if (count === 1) {
        const v = read(6);
        if (v >= 45) throw new QrDecodeError("invalid alphanumeric character");
        chars += ALPHANUMERIC[v];
      }
      segments.push({ mode: "alphanumeric", length });
      parts.push(chars);
    } else if (mode === 4) {
      const count = read(CHAR_COUNT_BITS.byte[ccIndex]);
      const data = new Uint8Array(count);
      for (let i = 0; i < count; i++) data[i] = read(8);
      const decoded = decodeBytes(data, eci);
      segments.push({ mode: "byte", length: count, charset: decoded.charset });
      parts.push(decoded.text);
    } else if (mode === 7) {
      const first = read(8);
      if ((first & 0x80) === 0) eci = first & 0x7f;
      else if ((first & 0xc0) === 0x80) eci = ((first & 0x3f) << 8) | read(8);
      else if ((first & 0xe0) === 0xc0) eci = ((first & 0x1f) << 16) | read(16);
      else throw new QrDecodeError("invalid ECI designator");
      segments.push({ mode: "eci", designator: eci });
    } else if (mode === 8) {
      throw new QrDecodeError("Kanji segments are not supported; use a phone scan");
    } else if (mode === 3) {
      throw new QrDecodeError("structured append (a code split across symbols) is not supported");
    } else if (mode === 5 || mode === 9) {
      throw new QrDecodeError("FNC1 (GS1) payloads are not supported");
    } else {
      throw new QrDecodeError(`unknown segment mode ${mode}`);
    }
  }
  return { text: parts.join(""), segments };
}

// ---------------------------------------------------------------------------------------------------------------------
// Matrix decoding
// ---------------------------------------------------------------------------------------------------------------------

const fail = (reason) => ({ ok: false, reason });

/**
 * Decode a square boolean module matrix (true = dark), quiet zone excluded.
 * Returns { ok: true, text, version, ecc, mask, segments, warnings } or { ok: false, reason }.
 */
export function decodeMatrix(modules) {
  const size = modules.length;
  if (size === 0 || !modules.every((row) => row.length === size)) return fail("the module matrix is not square");
  const version = (size - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 40) return fail(`${size} modules is not a QR symbol size`);
  if (!hasFinderPatterns(modules)) return fail("the three finder patterns are not all present");

  const read = (positions) => positions.reduce((v, [r, c], i) => v | ((modules[r][c] ? 1 : 0) << i), 0);
  const matchFormat = (bits) => {
    for (const level of EC_LEVELS) for (let mask = 0; mask < 8; mask++) if (formatBits(level, mask) === bits) return { level, mask };
    return null;
  };
  const [formatA, formatB] = formatPositions(size).map((copy) => matchFormat(read(copy)));
  const warnings = [];
  if (!formatA && !formatB) return fail("the format information is not a valid codeword in either copy");
  if (formatA && formatB && (formatA.level !== formatB.level || formatA.mask !== formatB.mask)) {
    return fail("the two format-information copies disagree");
  }
  if (!formatA || !formatB) warnings.push("one format-information copy is damaged; the other is valid");
  const { level, mask } = formatA ?? formatB;
  if (!modules[size - 8][8]) warnings.push("the fixed dark module is light");

  if (version >= 7) {
    const expected = versionBits(version);
    const copies = versionPositions(size).map((copy) => read(copy) === expected);
    if (!copies[0] && !copies[1]) return fail(`the version information does not match version ${version}`);
    if (!copies[0] || !copies[1]) warnings.push("one version-information copy is damaged; the other is valid");
  }

  const layout = blockLayout(version, level);
  const codewords = readCodewords(modules, reservedMap(version), mask, layout.total);
  const dataBlocks = layout.sizes.map((s) => new Uint8Array(s));
  const ecBlocks = layout.sizes.map(() => new Uint8Array(layout.ecCount));
  let k = 0;
  const maxData = Math.max(...layout.sizes);
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < layout.blocks; b++) if (i < layout.sizes[b]) dataBlocks[b][i] = codewords[k++];
  }
  for (let i = 0; i < layout.ecCount; i++) for (let b = 0; b < layout.blocks; b++) ecBlocks[b][i] = codewords[k++];

  for (let b = 0; b < layout.blocks; b++) {
    const expected = reedSolomonCheck(dataBlocks[b], layout.ecCount);
    if (!expected.every((v, i) => v === ecBlocks[b][i])) {
      return fail(`Reed-Solomon check failed in block ${b + 1} of ${layout.blocks} (artwork differs from a valid symbol)`);
    }
  }

  const data = new Uint8Array(layout.sizes.reduce((sum, s) => sum + s, 0));
  let offset = 0;
  for (const block of dataBlocks) {
    data.set(block, offset);
    offset += block.length;
  }

  try {
    const { text, segments } = parseSegments(data, version);
    return { ok: true, text, version, size, ecc: level, mask, segments, warnings };
  } catch (err) {
    if (err instanceof QrDecodeError) return fail(err.message);
    throw err;
  }
}

/** Canonical matrix hash: rows of '1' (dark) / '0' joined by '\n', SHA-256 hex. */
export function matrixSha256(modules) {
  return sha256(modules.map((row) => row.map((m) => (m ? "1" : "0")).join("")).join("\n"));
}

/**
 * Other plausible serializations, used to compare against hashes recorded by other tools (for example the marketing
 * registry's `matrix_sha256`, produced by an undocumented method). Each is computed on the bare symbol and on the
 * symbol with a four-module quiet zone.
 */
export function matrixHashVariants(modules) {
  const out = {};
  for (const [suffix, grid] of [
    ["", modules],
    ["+qz4", withQuietZone(modules, 4)],
  ]) {
    const flat = grid.flat();
    const ints = grid.map((row) => row.map((m) => (m ? 1 : 0)));
    out[`rows01${suffix}`] = matrixSha256(grid);
    out[`rows01-trailing-newline${suffix}`] = sha256(`${grid.map((row) => row.map((m) => (m ? "1" : "0")).join("")).join("\n")}\n`);
    out[`concat01${suffix}`] = sha256(flat.map((m) => (m ? "1" : "0")).join(""));
    out[`bytes-dark1${suffix}`] = sha256(Uint8Array.from(flat, (m) => (m ? 1 : 0)));
    out[`bytes-dark0${suffix}`] = sha256(Uint8Array.from(flat, (m) => (m ? 0 : 1)));
    out[`bytes-dark0-light255${suffix}`] = sha256(Uint8Array.from(flat, (m) => (m ? 0 : 255)));
    out[`bytes-dark255${suffix}`] = sha256(Uint8Array.from(flat, (m) => (m ? 255 : 0)));
    out[`json-compact${suffix}`] = sha256(JSON.stringify(ints));
    out[`json-python${suffix}`] = sha256(JSON.stringify(ints).replace(/,/g, ", "));
    out[`json-bool-python${suffix}`] = sha256(
      `[${grid.map((row) => `[${row.map((m) => (m ? "true" : "false")).join(", ")}]`).join(", ")}]`
    );
  }
  return out;
}

function withQuietZone(modules, margin) {
  const size = modules.length + margin * 2;
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => modules[r - margin]?.[c - margin] ?? false)
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

// ---------------------------------------------------------------------------------------------------------------------
// SVG module grids
// ---------------------------------------------------------------------------------------------------------------------

function parseAttributes(source) {
  const attrs = {};
  for (const m of source.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3];
  return attrs;
}

const NAMED_LIGHT = new Set(["white", "#fff", "#ffffff", "none", "transparent"]);

/** True for colours a QR treats as light (luminance above one half). */
export function isLightColor(value) {
  const color = (value ?? "").trim().toLowerCase();
  if (NAMED_LIGHT.has(color)) return true;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(color);
  if (!hex) return false;
  const full = hex[1].length === 3 ? hex[1].replace(/(.)/g, "$1$1") : hex[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

const NUM = String.raw`-?\d+(?:\.\d+)?`;
// Command letters are case-sensitive in SVG (H/V are absolute), so only the closing z/Z is matched either way.
const UNIT_SQUARE = new RegExp(String.raw`M\s*(${NUM})[\s,]+(${NUM})\s*h\s*1\s*v\s*1\s*h\s*-1\s*[zZ]`, "g");

/** A path made only of `M x y h1 v1 h-1 z` unit squares at integer coordinates, or null. */
function unitSquareCells(d) {
  const cells = [];
  for (const m of d.matchAll(UNIT_SQUARE)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    cells.push([x, y]);
  }
  if (cells.length === 0) return null;
  return d.replace(UNIT_SQUARE, "").trim() === "" ? cells : null;
}

/** A `qrcode`-style stroked path (M/m moves and h runs on half-module rows), or null. */
function strokeRunCells(d) {
  const tokens = [...d.matchAll(/([MmHhVvLlZzCcSsQqTtAa])([^MmHhVvLlZzCcSsQqTtAa]*)/g)];
  if (tokens.length === 0) return null;
  const cells = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of tokens) {
    const nums = (args.match(new RegExp(NUM, "g")) ?? []).map(Number);
    if (cmd === "M" || cmd === "m") {
      if (nums.length !== 2) return null;
      x = cmd === "M" ? nums[0] : x + nums[0];
      y = cmd === "M" ? nums[1] : y + nums[1];
    } else if (cmd === "h") {
      if (nums.length !== 1 || nums[0] <= 0) return null;
      const row = y - 0.5;
      if (!Number.isInteger(row) || !Number.isInteger(x) || !Number.isInteger(nums[0])) return null;
      for (let i = 0; i < nums[0]; i++) cells.push([x + i, row]);
      x += nums[0];
    } else {
      return null;
    }
  }
  return cells.length > 0 ? cells : null;
}

function cellsToGrid(cells) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const size = maxX - minX + 1;
  if (size !== maxY - minY + 1 || size < 21 || size > 177) return null;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  for (const [x, y] of cells) modules[y - minY][x - minX] = true;
  return { modules, offset: [minX, minY] };
}

function stripTags(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

/** The first <text> after a position, before the next path — the visible label on exported QR sheets. */
function labelAfter(svg, index) {
  const nextPath = svg.indexOf("<path", index);
  const window = svg.slice(index, nextPath === -1 ? index + 4000 : nextPath);
  const m = /<text\b[^>]*>([\s\S]*?)<\/text>/i.exec(window);
  return m ? stripTags(m[1]) || null : null;
}

/** The document's own claims (root <title> and aria-label). Recorded for comparison only — never as proof. */
export function declaredLabels(svg) {
  const title = /<title>([\s\S]*?)<\/title>/i.exec(svg);
  const aria = /<svg\b[^>]*\baria-label\s*=\s*"([^"]*)"/i.exec(svg);
  return { title: title ? stripTags(title[1]) : null, ariaLabel: aria ? aria[1] : null };
}

/**
 * True when something is drawn after the module path inside the same container (the app's branded export puts its
 * logo knockout there). The grid still decodes from the path, but the printed symbol differs from it.
 */
function overlaidAfter(svg, index) {
  const ends = [svg.indexOf("</svg>", index), svg.indexOf("</g>", index)].filter((i) => i !== -1);
  const window = svg.slice(index, ends.length ? Math.min(...ends) : svg.length);
  return /<(image|rect|path|use|circle|ellipse|polygon|polyline)\b/i.test(window);
}

/** Every QR-shaped module grid drawn by a path in the SVG, in document order. Light-coloured paths are skipped. */
export function extractModuleGrids(svg) {
  const grids = [];
  for (const m of svg.matchAll(/<path\b([^>]*?)\/?>/gi)) {
    const attrs = parseAttributes(m[1]);
    if (!attrs.d) continue;
    let cells = null;
    let format = null;
    if (attrs.stroke && attrs.stroke !== "none") {
      if (isLightColor(attrs.stroke)) continue;
      cells = strokeRunCells(attrs.d);
      format = "stroke-runs";
    } else {
      if (attrs.fill && isLightColor(attrs.fill)) continue;
      cells = unitSquareCells(attrs.d);
      format = "unit-squares";
    }
    if (!cells) continue;
    const grid = cellsToGrid(cells);
    if (!grid || !hasFinderPatterns(grid.modules)) continue;
    const end = m.index + m[0].length;
    grids.push({
      format,
      offset: grid.offset,
      modules: grid.modules,
      label: labelAfter(svg, end),
      overlaid: overlaidAfter(svg, end),
    });
  }
  return grids;
}

/** Decode every QR grid in an SVG document. */
export function decodeSvg(svg) {
  return extractModuleGrids(svg).map((grid) => {
    const result = decodeMatrix(grid.modules);
    if (result.ok && grid.overlaid) {
      result.warnings.push("an element is drawn over the module grid; confirm the printed symbol with a phone scan");
    }
    return {
      format: grid.format,
      offset: grid.offset,
      label: grid.label,
      matrixSha256: matrixSha256(grid.modules),
      result,
      modules: grid.modules,
    };
  });
}
