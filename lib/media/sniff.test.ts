import { describe, expect, it } from "vitest";

import { sniffDocumentType, sniffedTypeMatchesMime } from "./sniff";

// Leading-byte types for hosted documents (lib/media/sniff.ts).

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const head = (...parts: (number[] | number)[]) => new Uint8Array(parts.flat()).subarray(0, 12);

const PDF = head(ascii("%PDF-1.7\n%%EOF"));
const MP4 = head([0x00, 0x00, 0x00, 0x18], ascii("ftypisom"));
const MOV = head([0x00, 0x00, 0x00, 0x14], ascii("ftypqt  "));
const WEBM = head([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]);
const JPEG = head([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], ascii("JFIF\0\x01"));
const JUNK = head(ascii("hello world!"));

describe("sniffDocumentType", () => {
  it.each([
    ["PDF", PDF, "pdf"],
    ["MP4", MP4, "mp4"],
    ["QuickTime", MOV, "quicktime"],
    ["WebM", WEBM, "webm"],
    ["JPEG", JPEG, "jpeg"],
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
    expect(sniffedTypeMatchesMime("webm", "video/webm")).toBe(true);
    expect(sniffedTypeMatchesMime("webm", "video/mp4")).toBe(false);
    expect(sniffedTypeMatchesMime(null, "application/pdf")).toBe(false);
  });
});
