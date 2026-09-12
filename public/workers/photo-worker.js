/*
 * Mulemark photo preparation worker (Engineering Phase D4.1). A classic worker, started only when someone picks a
 * photo that has to be converted (lib/media/consumer-photo/prepare-photos.ts). It decodes one image, fits it inside
 * the requested pixel and edge limits, and encodes a browser-safe JPEG or PNG. The canvas encoder writes no EXIF, GPS
 * or other metadata. Orientation comes from the image itself (EXIF orientation, HEIF/AVIF irot and imir).
 *
 * The browser decodes JPEG, PNG, WebP, GIF (first frame), AVIF and, in Safari 17+, HEIC. When it cannot decode a
 * HEIC/HEIF photo, the unmodified libheif-js WebAssembly build in /vendor/libheif/ (LGPL-3.0; see NOTICE.md there) is
 * loaded on demand, in this worker only.
 *
 * In:  { id, blob, kind, target: { type: "image/jpeg" | "image/png", quality, maxPixels, maxEdge } }
 * Out: { id, ok: true, blob, width, height, decoder: "native" | "libheif" } | { id, ok: false, reason }
 * Reasons: "decode" (the bytes could not be decoded), "too-large" (more pixels than can be decoded safely),
 * "encode" (the browser could not produce the output), "unsupported" (no OffscreenCanvas in workers).
 */
"use strict";

const LIBHEIF_BASE = "/vendor/libheif/";
/** A 50 MP HEIC needs ~200 MB of RGBA before resizing; beyond this the photo is refused rather than risk the tab. */
const LIBHEIF_MAX_PIXELS = 52_000_000;

let libheifModule = null;

function failure(reason) {
  const error = new Error(reason);
  error.reason = reason;
  return error;
}

function fit(width, height, maxPixels, maxEdge) {
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)), maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

async function encode(source, width, height, target) {
  const size = fit(width, height, target.maxPixels, target.maxEdge);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  if (!context) throw failure("encode");
  if (target.type === "image/jpeg") {
    // JPEG has no transparency: flatten onto white rather than the encoder's black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, size.width, size.height);
  let blob;
  try {
    blob = await canvas.convertToBlob({ type: target.type, quality: target.quality });
  } catch {
    throw failure("encode");
  }
  if (!blob || blob.type !== target.type || blob.size === 0) throw failure("encode");
  return { blob, width: size.width, height: size.height };
}

async function decodeNatively(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch (error) {
    // Browsers that predate the "from-image" value reject the option itself; their default applies orientation.
    if (error && error.name === "TypeError") {
      try {
        return await createImageBitmap(blob);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function loadLibheif() {
  if (!libheifModule) {
    importScripts(LIBHEIF_BASE + "libheif.js");
    const response = await fetch(LIBHEIF_BASE + "libheif.wasm");
    if (!response.ok) throw failure("decode");
    const wasmBinary = new Uint8Array(await response.arrayBuffer());
    let created = self.libheif({ wasmBinary });
    if (created && typeof created.then === "function" && !created.HeifDecoder) created = await created;
    libheifModule = created;
  }
  return libheifModule;
}

async function viaLibheif(blob, target) {
  const lib = await loadLibheif();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let images;
  try {
    images = new lib.HeifDecoder().decode(bytes);
  } catch {
    throw failure("decode");
  }
  if (!images || images.length === 0) throw failure("decode");
  // The primary image, never an auxiliary thumbnail or depth map.
  const image = images.find((each) => typeof each.is_primary === "function" && each.is_primary()) || images[0];
  try {
    const width = image.get_width();
    const height = image.get_height();
    if (!(width > 0 && height > 0)) throw failure("decode");
    if (width * height > LIBHEIF_MAX_PIXELS) throw failure("too-large");
    const pixels = await new Promise((resolve) => {
      image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, resolve);
    });
    if (!pixels) throw failure("decode");
    const bitmap = await createImageBitmap(new ImageData(pixels.data, width, height));
    try {
      return await encode(bitmap, width, height, target);
    } finally {
      bitmap.close();
    }
  } finally {
    for (const each of images) if (typeof each.free === "function") each.free();
  }
}

self.onmessage = async (event) => {
  const { id, blob, kind, target } = event.data || {};
  try {
    if (typeof OffscreenCanvas === "undefined") {
      self.postMessage({ id, ok: false, reason: "unsupported" });
      return;
    }
    let decoder = "native";
    let result = null;
    const bitmap = await decodeNatively(blob);
    if (bitmap) {
      try {
        result = await encode(bitmap, bitmap.width, bitmap.height, target);
      } finally {
        bitmap.close();
      }
    } else if (kind === "heic" || kind === "heif") {
      decoder = "libheif";
      result = await viaLibheif(blob, target);
    } else {
      throw failure("decode");
    }
    self.postMessage({ id, ok: true, blob: result.blob, width: result.width, height: result.height, decoder });
  } catch (error) {
    self.postMessage({ id, ok: false, reason: (error && error.reason) || "decode" });
  }
};
