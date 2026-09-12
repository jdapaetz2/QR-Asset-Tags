import { describe, expect, it } from "vitest";

import {
  SNIFF_BYTES,
  sniffConsumerImageType,
  sniffDocumentType,
  sniffHeifFamily,
  sniffImageType,
  sniffedTypeMatchesMime,
} from "./sniff";

// Leading-byte types (lib/media/sniff.ts).

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const head = (...parts: (number[] | number)[]) => new Uint8Array(parts.flat()).subarray(0, SNIFF_BYTES);
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
/** An ISO-BMFF `ftyp` box: size, "ftyp", major brand, minor version, compatible brands. */
const ftyp = (major: string, ...compatible: string[]) =>
  head(u32(16 + 4 * compatible.length), ascii("ftyp"), ascii(major), [0, 0, 0, 0], ...compatible.map(ascii), ascii("\0\0\0\0meta"));

const PDF = head(ascii("%PDF-1.7\n%%EOF"));
const MP4 = ftyp("isom", "isom", "iso2", "mp41");
const MOV = ftyp("qt  ", "qt  ");
const IPHONE_HEIC = ftyp("heic", "mif1", "heic");
const GENERIC_HEIC = ftyp("mif1", "mif1", "heic");
const HEIF = ftyp("mif1", "mif1");
const AVIF = ftyp("avif", "avif", "mif1", "miaf", "MA1B");
const AVIF_SEQUENCE = ftyp("avis", "avif", "avis", "msf1");
const WEBM = head([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]);
const JPEG = head([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], ascii("JFIF\0\x01"));
const PNG = head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = head(ascii("RIFF"), [0, 0, 0, 0], ascii("WEBPVP8 "));
const GIF = head(ascii("GIF89a"), [1, 0, 1, 0]);
const TIFF_LE = head([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]);
const TIFF_BE = head([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8]);
const JUNK = head(ascii("hello world! this is not an image at all"));

describe("sniffHeifFamily", () => {
  it.each([
    ["an iPhone HEIC", IPHONE_HEIC, "heic"],
    ["a HEIC with a generic major brand", GENERIC_HEIC, "heic"],
    ["a generic HEIF", HEIF, "heif"],
    ["an AVIF", AVIF, "avif"],
    ["an AVIF sequence", AVIF_SEQUENCE, "avif"],
    ["an MP4 video", MP4, null],
    ["a QuickTime video", MOV, null],
    ["a JPEG", JPEG, null],
  ])("reads %s", (_name, bytes, kind) => {
    expect(sniffHeifFamily(bytes)).toBe(kind);
  });

  it("only reads compatible brands inside the ftyp box", () => {
    const bytes = new Uint8Array([...u32(16), ...ascii("ftypisom"), 0, 0, 0, 0, ...ascii("heic")]);
    expect(sniffHeifFamily(bytes)).toBeNull();
  });
});

describe("sniffConsumerImageType", () => {
  it.each([
    ["JPEG", JPEG, "jpeg"],
    ["PNG", PNG, "png"],
    ["WebP", WEBP, "webp"],
    ["GIF", GIF, "gif"],
    ["little-endian TIFF", TIFF_LE, "tiff"],
    ["big-endian TIFF", TIFF_BE, "tiff"],
    ["HEIC", IPHONE_HEIC, "heic"],
    ["AVIF", AVIF, "avif"],
    ["PDF", PDF, null],
    ["an MP4 video", MP4, null],
    ["junk", JUNK, null],
    ["empty", new Uint8Array(0), null],
  ])("reads %s", (_name, bytes, kind) => {
    expect(sniffConsumerImageType(bytes)).toBe(kind);
  });

  it("stores only JPEG, PNG and WebP as web-safe types", () => {
    expect([JPEG, PNG, WEBP, GIF, IPHONE_HEIC, AVIF, TIFF_LE].map(sniffImageType)).toEqual([
      "jpeg",
      "png",
      "webp",
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("sniffDocumentType", () => {
  it.each([
    ["PDF", PDF, "pdf"],
    ["MP4", MP4, "mp4"],
    ["QuickTime", MOV, "quicktime"],
    ["WebM", WEBM, "webm"],
    ["JPEG", JPEG, "jpeg"],
    // A HEIC photo is an ISO-BMFF file too; it was once read as an MP4 video.
    ["HEIC", IPHONE_HEIC, "heic"],
    ["HEIF", HEIF, "heif"],
    ["AVIF", AVIF, "avif"],
    ["junk", JUNK, null],
    ["empty", new Uint8Array(0), null],
  ])("reads %s", (_name, bytes, kind) => {
    expect(sniffDocumentType(bytes)).toBe(kind);
  });
});

describe("sniffedTypeMatchesMime", () => {
  it("accepts only the stored types each kind may carry", () => {
    expect(sniffedTypeMatchesMime("pdf", "application/pdf")).toBe(true);
    expect(sniffedTypeMatchesMime("pdf", "image/jpeg")).toBe(false);
    expect(sniffedTypeMatchesMime("jpeg", "application/pdf")).toBe(false);
    // ISO-BMFF files are labelled either way by real devices.
    expect(sniffedTypeMatchesMime("mp4", "video/quicktime")).toBe(true);
    expect(sniffedTypeMatchesMime("quicktime", "video/mp4")).toBe(true);
    expect(sniffedTypeMatchesMime("heic", "image/heif")).toBe(true);
    expect(sniffedTypeMatchesMime("heif", "image/heic")).toBe(true);
    expect(sniffedTypeMatchesMime("heic", "video/mp4")).toBe(false);
    expect(sniffedTypeMatchesMime("avif", "image/avif")).toBe(true);
    expect(sniffedTypeMatchesMime("webm", "video/webm")).toBe(true);
    expect(sniffedTypeMatchesMime("webm", "video/mp4")).toBe(false);
    expect(sniffedTypeMatchesMime(null, "application/pdf")).toBe(false);
  });
});
