import { COVER_MAX_BYTES } from "@/lib/assets/cover";
import { MAX_FILE_BYTES } from "@/lib/forms/media";
import {
  MAX_IMAGE_EDGE,
  RAW_PHOTO_EXTENSIONS,
  fileExtension,
  withinImageLimits,
  type ImageClass,
  type ImageDimensions,
} from "@/lib/media/classify";
import { LOGO_MAX_BYTES } from "@/lib/org/logo";

/**
 * How a picked photo becomes a stored one (Engineering Phase D4.1). Pure — the browser adapter applies it
 * (lib/media/consumer-photo/), and the server re-verifies everything it stores.
 *
 * Accept broadly, identify by bytes, keep a web-safe original when it already fits, and otherwise convert it on the
 * device to a browser-safe JPEG (or PNG for logos). Stored operational images stay JPEG, PNG or WebP.
 */

/** File-picker hint for photo inputs. Broad on purpose, and never `image/heic` (Safari 17 then rewrites formats). */
export const PHOTO_ACCEPT = "image/*,.heic,.heif,.avif";

export type EncodeTarget = {
  type: "image/jpeg" | "image/png";
  quality: number;
  maxPixels: number;
  maxEdge: number;
};

export type PhotoProfile = {
  name: "evidence" | "cover" | "logo";
  /** The stored size limit. */
  maxBytes: number;
  /** Conversion attempts in order; the first output within `maxBytes` is used. */
  targets: readonly EncodeTarget[];
};

const jpeg = (quality: number, maxPixels: number, maxEdge = MAX_IMAGE_EDGE): EncodeTarget => ({
  type: "image/jpeg",
  quality,
  maxPixels,
  maxEdge,
});

/** Damage, support, return and outbound photos: up to 10 MB; conversions are a high-quality JPEG of at most 16 MP. */
export const EVIDENCE_PHOTO: PhotoProfile = {
  name: "evidence",
  maxBytes: MAX_FILE_BYTES,
  targets: [jpeg(0.9, 16_000_000), jpeg(0.8, 16_000_000), jpeg(0.8, 8_000_000), jpeg(0.7, 4_000_000)],
};

/** Asset cover images: up to 5 MB, shown on the public scan page. */
export const COVER_PHOTO: PhotoProfile = {
  name: "cover",
  maxBytes: COVER_MAX_BYTES,
  targets: [jpeg(0.88, 8_000_000), jpeg(0.8, 4_000_000), jpeg(0.7, 2_000_000)],
};

/** Organization logos: up to 2 MB; conversions are a PNG (transparency kept) of at most 1024 px. */
export const LOGO_IMAGE: PhotoProfile = {
  name: "logo",
  maxBytes: LOGO_MAX_BYTES,
  targets: [
    { type: "image/png", quality: 1, maxPixels: 1024 * 1024, maxEdge: 1024 },
    jpeg(0.9, 1024 * 1024, 1024),
    jpeg(0.8, 512 * 512, 512),
  ],
};

/** The largest picked file the adapter tries to convert (a 200 MP camera JPEG is about 60 MB). */
export const MAX_INPUT_BYTES = 100 * 1024 * 1024;

export type RefusalReason = "unsupported" | "raw" | "vector" | "document" | "empty" | "too-large" | "timeout";

export const PHOTO_REFUSAL_MESSAGES: Record<RefusalReason, string> = {
  unsupported:
    "This photo couldn't be prepared. Take another photo, choose the still image, or share it as a standard photo (JPEG).",
  raw: "RAW photos can't be uploaded. Share or export it as a standard photo (JPEG) and try again.",
  vector: "SVG drawings can't be used here. Choose a photo instead.",
  document: "PDFs can't be used as photos. Choose a photo instead.",
  empty: "This file is empty. Choose the photo again.",
  "too-large": "This photo is too large to prepare on this device. Take another photo or share a smaller copy.",
  timeout: "This photo took too long to prepare. Try again, or share it as a standard photo (JPEG).",
};

export type PhotoDecision =
  | { action: "keep"; type: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" }
  | { action: "convert" }
  | { action: "refuse"; reason: RefusalReason };

const KEEPABLE = { jpeg: "jpg", png: "png", webp: "webp" } as const;

export function decidePhoto(
  input: { image: ImageClass; dimensions: ImageDimensions | null; size: number; name: string },
  profile: PhotoProfile
): PhotoDecision {
  const refuse = (reason: RefusalReason): PhotoDecision => ({ action: "refuse", reason });
  const { kind, motionPhoto } = input.image;
  if (input.size === 0) return refuse("empty");
  // DNG and most RAW formats are TIFF-based; others have no recognisable image bytes at all.
  if ((kind === null || kind === "tiff") && RAW_PHOTO_EXTENSIONS.has(fileExtension(input.name))) return refuse("raw");
  if (kind === "svg") return refuse("vector");
  if (kind === "pdf") return refuse("document");
  if (kind === null || kind === "psd") return refuse("unsupported");
  if (input.size > MAX_INPUT_BYTES) return refuse("too-large");
  if (
    (kind === "jpeg" || kind === "png" || kind === "webp") &&
    !motionPhoto &&
    input.size <= profile.maxBytes &&
    input.dimensions !== null &&
    withinImageLimits(input.dimensions)
  ) {
    return { action: "keep", type: `image/${kind}`, extension: KEEPABLE[kind] };
  }
  return { action: "convert" };
}
