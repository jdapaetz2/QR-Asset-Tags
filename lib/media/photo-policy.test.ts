import { describe, expect, it } from "vitest";

import type { ImageClass } from "./classify";
import { COVER_PHOTO, EVIDENCE_PHOTO, LOGO_IMAGE, MAX_INPUT_BYTES, PHOTO_ACCEPT, decidePhoto } from "./photo-policy";

// Keep, convert or refuse a picked photo (lib/media/photo-policy.ts).

const MB = 1024 * 1024;
const image = (kind: ImageClass["kind"], motionPhoto = false): ImageClass => ({ kind, motionPhoto });
const photo = (overrides: Partial<Parameters<typeof decidePhoto>[0]> = {}) => ({
  image: image("jpeg"),
  dimensions: { width: 4032, height: 3024 },
  size: 3 * MB,
  name: "IMG_0001.JPG",
  ...overrides,
});

describe("decidePhoto", () => {
  it("keeps a web-safe photo that already fits, with its type taken from the bytes", () => {
    expect(decidePhoto(photo(), EVIDENCE_PHOTO)).toEqual({ action: "keep", type: "image/jpeg", extension: "jpg" });
    expect(decidePhoto(photo({ image: image("png"), name: "Screenshot" }), EVIDENCE_PHOTO)).toMatchObject({ type: "image/png" });
    expect(decidePhoto(photo({ image: image("webp"), name: "photo.jpg" }), EVIDENCE_PHOTO)).toMatchObject({ type: "image/webp" });
  });

  it.each([
    ["HEIC", photo({ image: image("heic"), dimensions: null, name: "IMG_0001.HEIC" })],
    ["HEIF", photo({ image: image("heif"), dimensions: null })],
    ["AVIF", photo({ image: image("avif"), dimensions: null })],
    ["GIF", photo({ image: image("gif") })],
    ["TIFF", photo({ image: image("tiff"), name: "scan.tif" })],
    ["a Motion Photo", photo({ image: image("jpeg", true) })],
    ["a JPEG over 10 MB", photo({ size: 12 * MB })],
    ["a 48 MP JPEG", photo({ dimensions: { width: 8064, height: 6048 } })],
    ["a JPEG whose frame size cannot be read", photo({ dimensions: null })],
  ])("converts %s", (_name, input) => {
    expect(decidePhoto(input, EVIDENCE_PHOTO)).toEqual({ action: "convert" });
  });

  it("applies each profile's own size limit", () => {
    expect(decidePhoto(photo({ size: 6 * MB }), EVIDENCE_PHOTO).action).toBe("keep");
    expect(decidePhoto(photo({ size: 6 * MB }), COVER_PHOTO).action).toBe("convert");
    expect(decidePhoto(photo({ size: 2.5 * MB }), LOGO_IMAGE).action).toBe("convert");
  });

  it.each([
    ["an empty file", photo({ size: 0 }), "empty"],
    ["a DNG", photo({ image: image("tiff"), name: "IMG_0001.DNG" }), "raw"],
    ["a CR3 RAW", photo({ image: image(null), name: "IMG_0001.CR3" }), "raw"],
    ["an SVG", photo({ image: image("svg"), name: "logo.svg" }), "vector"],
    ["a PDF", photo({ image: image("pdf"), name: "manual.pdf" }), "document"],
    ["a Photoshop file", photo({ image: image("psd") }), "unsupported"],
    ["unrecognised bytes", photo({ image: image(null), name: "photo.jpg" }), "unsupported"],
    ["a file over 100 MB", photo({ image: image("heic"), size: MAX_INPUT_BYTES + 1 }), "too-large"],
  ])("refuses %s", (_name, input, reason) => {
    expect(decidePhoto(input, EVIDENCE_PHOTO)).toEqual({ action: "refuse", reason });
  });

  it("identifies by bytes, not by name: a renamed JPEG is kept, a renamed HEIC is converted", () => {
    expect(decidePhoto(photo({ name: "IMG_0001.HEIC" }), EVIDENCE_PHOTO).action).toBe("keep");
    expect(decidePhoto(photo({ image: image("heic"), name: "IMG_0001.jpg" }), EVIDENCE_PHOTO).action).toBe("convert");
  });
});

describe("profiles", () => {
  it("offers a broad picker without the HEIC MIME type Safari rewrites", () => {
    expect(PHOTO_ACCEPT).toBe("image/*,.heic,.heif,.avif");
    expect(PHOTO_ACCEPT).not.toContain("image/heic");
  });

  it("converts evidence to a high-quality JPEG of at most 16 MP within the 10 MB limit, and logos to PNG first", () => {
    expect(EVIDENCE_PHOTO.maxBytes).toBe(10 * MB);
    expect(EVIDENCE_PHOTO.targets[0]).toEqual({ type: "image/jpeg", quality: 0.9, maxPixels: 16_000_000, maxEdge: 16_384 });
    expect(COVER_PHOTO.maxBytes).toBe(5 * MB);
    expect(LOGO_IMAGE.targets[0]).toMatchObject({ type: "image/png", maxEdge: 1024 });
  });
});
