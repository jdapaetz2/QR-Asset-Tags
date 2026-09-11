import "server-only";

import {
  PREVIEW_JPEG_QUALITY,
  PREVIEW_LONG_EDGE_PX,
  PREVIEW_MAX_DIMENSION,
  PREVIEW_MAX_INPUT_BYTES,
  PREVIEW_MAX_INPUT_PIXELS,
  PREVIEW_MAX_OUTPUT_BYTES,
  PREVIEW_RETRY_QUALITY,
  type PreviewFailureClass,
} from "@/lib/notifications/preview-limits";
import { sniffImageType, type SniffedImageType } from "@/lib/media/sniff";

/**
 * Engineering Phase D4 — turn ONE stored submission photo into a small email preview. Server-only, and only ever
 * called from the deferred notification (never on the public response path).
 *
 * The preview is a NEW image: auto-oriented, fitted within 640 px, flattened onto white and re-encoded as JPEG. Sharp
 * strips all metadata (EXIF, GPS, ICC, XMP, IPTC) unless told to keep it, and this module never calls `withMetadata`,
 * `keepExif` or `keepIccProfile`. The stored original is read, never modified, and nothing here claims the original
 * has been cleaned.
 *
 * Untrusted input is bounded before a decoder runs: a byte cap, then a magic-byte sniff so only JPEG/PNG/WebP bytes
 * reach Sharp (SVG, GIF, TIFF and HEIF decoders are never invoked), then a header-only dimension and pixel check, and
 * `limitInputPixels` on the decode itself. Every failure is a coarse class; this function never throws.
 */

type SharpFactory = typeof import("sharp");

/** Injectable for tests; production loads Sharp lazily so a missing native binary can never break notifications. */
export type SharpLoader = () => Promise<SharpFactory | null>;

// The byte sniff is shared with the direct-upload verifier (lib/forms/media-verify.ts).
export { sniffImageType };
export type { SniffedImageType };

export type PreviewImageFailure = Extract<
  PreviewFailureClass,
  "too_large_input" | "unsupported_type" | "too_many_pixels" | "decode_failed" | "too_large_output" | "transformer_unavailable"
>;

export type PreviewImageResult =
  | { ok: true; jpeg: Buffer; width: number; height: number; bytes: number }
  | { ok: false; failureClass: PreviewImageFailure };

let cachedSharp: Promise<SharpFactory | null> | null = null;

export const loadSharp: SharpLoader = () => {
  cachedSharp ??= import("sharp")
    .then((mod) => {
      const sharp = (mod as unknown as { default?: SharpFactory }).default ?? (mod as unknown as SharpFactory);
      // No libvips operation cache (memory stays bounded per invocation) and one worker thread on a 1 vCPU function.
      sharp.cache(false);
      sharp.concurrency(1);
      return sharp;
    })
    .catch(() => null);
  return cachedSharp;
};

const fail = (failureClass: PreviewImageFailure): PreviewImageResult => ({ ok: false, failureClass });

/** Sharp's refusal under `limitInputPixels` ("Input image exceeds pixel limit"). */
function isPixelLimitError(err: unknown): boolean {
  return err instanceof Error && /pixel limit/i.test(err.message);
}

export async function transformPreview(
  bytes: Uint8Array,
  options: { load?: SharpLoader; maxOutputBytes?: number } = {}
): Promise<PreviewImageResult> {
  try {
    if (bytes.byteLength > PREVIEW_MAX_INPUT_BYTES) return fail("too_large_input");
    const sniffed = sniffImageType(bytes);
    if (!sniffed) return fail("unsupported_type");

    const sharp = await (options.load ?? loadSharp)();
    if (!sharp) return fail("transformer_unavailable");

    const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const inputOptions = {
      limitInputPixels: PREVIEW_MAX_INPUT_PIXELS,
      failOn: "warning",
      sequentialRead: true,
      animated: false,
    } as const;

    let width = 0;
    let height = 0;
    try {
      const meta = await sharp(input, inputOptions).metadata();
      // The container must agree with the sniff: a PNG header on JPEG bytes is not a photo we preview.
      if (meta.format !== sniffed) return fail("unsupported_type");
      width = meta.width ?? 0;
      height = meta.height ?? 0;
    } catch (err) {
      // libvips enforces `limitInputPixels` while reading the header, so a bomb can be refused right here.
      return fail(isPixelLimitError(err) ? "too_many_pixels" : "decode_failed");
    }
    if (width <= 0 || height <= 0) return fail("decode_failed");
    if (width > PREVIEW_MAX_DIMENSION || height > PREVIEW_MAX_DIMENSION || width * height > PREVIEW_MAX_INPUT_PIXELS) {
      return fail("too_many_pixels");
    }

    const maxOutput = options.maxOutputBytes ?? PREVIEW_MAX_OUTPUT_BYTES;
    const encode = (quality: number) =>
      sharp(input, inputOptions)
        .autoOrient()
        .resize({ width: PREVIEW_LONG_EDGE_PX, height: PREVIEW_LONG_EDGE_PX, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });

    try {
      let output = await encode(PREVIEW_JPEG_QUALITY);
      if (output.info.size > maxOutput) output = await encode(PREVIEW_RETRY_QUALITY);
      if (output.info.size > maxOutput) return fail("too_large_output");
      return {
        ok: true,
        jpeg: output.data,
        width: output.info.width,
        height: output.info.height,
        bytes: output.info.size,
      };
    } catch (err) {
      return fail(isPixelLimitError(err) ? "too_many_pixels" : "decode_failed");
    }
  } catch {
    return fail("decode_failed");
  }
}
