/**
 * Engineering Phase D4 — the bounds for inline photo previews, in one pure module so the transformer, the assembler,
 * the logger and the tests all read the same numbers. No I/O.
 */

/** Largest stored object read for a preview — the upload cap (lib/forms/media.ts). Checked before any decode. */
export const PREVIEW_MAX_INPUT_BYTES = 10 * 1024 * 1024;
/** Decoded pixel ceiling (decompression-bomb guard), and a per-side ceiling for extreme aspect ratios. */
export const PREVIEW_MAX_INPUT_PIXELS = 40_000_000;
export const PREVIEW_MAX_DIMENSION = 12_000;
/** Long edge of a preview, never enlarged. */
export const PREVIEW_LONG_EDGE_PX = 640;
export const PREVIEW_JPEG_QUALITY = 72;
/** One lower-quality retry when the first encode is over the per-image cap. */
export const PREVIEW_RETRY_QUALITY = 55;
/** Hard cap per preview and across the set. Real 640 px output is typically 40–150 KB. */
export const PREVIEW_MAX_OUTPUT_BYTES = 400 * 1024;
export const PREVIEW_MAX_TOTAL_BYTES = 1200 * 1024;
/** Media work happens before the send and has its own budget; the 15 s send budget is unchanged. */
export const PREVIEW_BUDGET_MS = 6_000;
export const PREVIEW_CONCURRENCY = 2;
/** Log bound for the transform duration. */
export const PREVIEW_MAX_TRANSFORM_MS = 60_000;

/** Why a preview was omitted. A closed set — logged as-is, never with a path or error body. */
export const PREVIEW_FAILURE_CLASSES = [
  "path_rejected",
  "missing_object",
  "download_failed",
  "too_large_input",
  "unsupported_type",
  "too_many_pixels",
  "decode_failed",
  "too_large_output",
  "transformer_unavailable",
  "total_budget",
  "time_budget",
  "exception",
] as const;
export type PreviewFailureClass = (typeof PREVIEW_FAILURE_CLASSES)[number];

/** Coarse total preview bytes for the log — never an exact size. */
export const PREVIEW_BYTES_BUCKETS = ["none", "lt_250kb", "lt_500kb", "lt_1mb", "lt_1_5mb"] as const;
export type PreviewBytesBucket = (typeof PREVIEW_BYTES_BUCKETS)[number];

export function previewBytesBucket(totalBytes: number): PreviewBytesBucket {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return "none";
  if (totalBytes < 250 * 1024) return "lt_250kb";
  if (totalBytes < 500 * 1024) return "lt_500kb";
  if (totalBytes < 1024 * 1024) return "lt_1mb";
  return "lt_1_5mb";
}
