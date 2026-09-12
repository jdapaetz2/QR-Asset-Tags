import { SNIFF_BYTES, sniffConsumerImageType, sniffImageType, type ConsumerImageType } from "@/lib/media/sniff";

/**
 * What an image file is and how big its frame is, read from its bytes (Engineering Phase D4.1). Pure, no I/O — shared
 * by the browser photo adapter (lib/media/consumer-photo/) and the server verifiers.
 */

/** How much of a picked file the browser reads to classify it: room for EXIF and XMP ahead of a JPEG frame header. */
export const CLASSIFY_BYTES = 128 * 1024;

/** The most of a stored object the server reads to find its frame size. */
export const IMAGE_HEAD_MAX_BYTES = 1024 * 1024;

/** Upper bounds for any stored operational image — evidence photos, covers and logos. */
export const MAX_IMAGE_EDGE = 16_384;
export const MAX_IMAGE_PIXELS = 40_000_000;

export type ImageKind = ConsumerImageType | "svg" | "pdf" | "psd";

export type ImageClass = {
  kind: ImageKind | null;
  /** A Motion Photo / Micro Video JPEG: a still with a video appended, which is converted to drop the video. */
  motionPhoto: boolean;
};

export type ImageDimensions = { width: number; height: number };

/** Camera RAW formats, refused by extension when the bytes are TIFF-based or unrecognised. */
export const RAW_PHOTO_EXTENSIONS: ReadonlySet<string> = new Set([
  "3fr", "arw", "cr2", "cr3", "crw", "dng", "erf", "iiq", "kdc", "mef", "mos", "mrw", "nef", "nrw", "orf", "pef",
  "raf", "raw", "rw2", "rwl", "sr2", "srf", "srw", "x3f",
]);

function text(bytes: Uint8Array, limit: number): string {
  const end = Math.min(bytes.length, limit);
  let out = "";
  for (let start = 0; start < end; start += 8192) {
    out += String.fromCharCode(...bytes.subarray(start, Math.min(end, start + 8192)));
  }
  return out;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function classifyImageBytes(head: Uint8Array): ImageClass {
  const kind = sniffConsumerImageType(head);
  if (kind) {
    return { kind, motionPhoto: kind === "jpeg" && /MotionPhoto|MicroVideo/.test(text(head, CLASSIFY_BYTES)) };
  }
  const start = text(head, 1024);
  if (start.startsWith("%PDF-")) return { kind: "pdf", motionPhoto: false };
  if (start.startsWith("8BPS")) return { kind: "psd", motionPhoto: false };
  // SVG is text: an optional UTF-8 byte-order mark and whitespace, then an XML declaration or the <svg> element.
  const trimmed = start.replace(/^(ï»¿)?\s*/, "");
  if (/^<svg[\s/>]/i.test(trimmed) || (/^<\?xml/i.test(trimmed) && /<svg[\s/>]/i.test(start))) {
    return { kind: "svg", motionPhoto: false };
  }
  return { kind: null, motionPhoto: false };
}

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

function dimensions(width: number, height: number): ImageDimensions | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

const JPEG_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Walks JPEG segments to the first frame header (SOFn). Null when scan data or the end comes first, or bytes run out. */
function jpegDimensions(b: Uint8Array): ImageDimensions | null {
  let offset = 2;
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return null;
    const marker = b[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(b, offset + 2);
    if (length < 2) return null;
    if (JPEG_FRAME_MARKERS.has(marker)) {
      return offset + 9 <= b.length ? dimensions(u16be(b, offset + 7), u16be(b, offset + 5)) : null;
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(b: Uint8Array): ImageDimensions | null {
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return dimensions(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8X") return dimensions(u24le(b, 24) + 1, u24le(b, 27) + 1);
  return null;
}

/** The frame size of a JPEG, PNG, WebP or GIF from its leading bytes, or null when it cannot be read. */
export function readImageDimensions(head: Uint8Array): ImageDimensions | null {
  switch (sniffConsumerImageType(head)) {
    case "jpeg":
      return jpegDimensions(head);
    case "png":
      return head.length >= 24 && String.fromCharCode(head[12], head[13], head[14], head[15]) === "IHDR"
        ? dimensions(u32be(head, 16), u32be(head, 20))
        : null;
    case "webp":
      return webpDimensions(head);
    case "gif":
      return head.length >= 10 ? dimensions(u16le(head, 6), u16le(head, 8)) : null;
    default:
      return null;
  }
}

export function withinImageLimits(size: ImageDimensions): boolean {
  return size.width <= MAX_IMAGE_EDGE && size.height <= MAX_IMAGE_EDGE && size.width * size.height <= MAX_IMAGE_PIXELS;
}

/** Whether a ranged read of a stored object has enough bytes to judge it (stop reading early when it does). */
export function imageHeadComplete(head: Uint8Array): boolean {
  if (head.length >= IMAGE_HEAD_MAX_BYTES) return true;
  if (head.length < SNIFF_BYTES) return false;
  return sniffImageType(head) === null || readImageDimensions(head) !== null;
}

/**
 * Whether stored bytes are an operational image of the stored type: JPEG, PNG or WebP by leading bytes, with a
 * readable frame size of at most 16,384 px per side and 40 MP.
 */
export function isStoredImage(head: Uint8Array, mime: string): boolean {
  const kind = sniffImageType(head);
  if (!kind || `image/${kind}` !== mime) return false;
  const size = readImageDimensions(head);
  return size !== null && withinImageLimits(size);
}
