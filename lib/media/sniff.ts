/**
 * The type the BYTES say a file is — never the extension or a declared MIME type. Pure, no I/O.
 *
 * Shared by the browser photo adapter (lib/media/consumer-photo/), the direct-upload verifiers
 * (lib/forms/media-verify.ts, lib/storage/verify-object.ts) and the email preview transformer
 * (lib/notifications/preview-image.ts).
 */

export type SniffedImageType = "jpeg" | "png" | "webp";

/** How many leading bytes the sniffers need: room for an ISO-BMFF `ftyp` box and its compatible brands. */
export const SNIFF_BYTES = 64;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** The web-safe image types Mulemark stores for operational photos. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  return null;
}

/** HEIF-family still images: HEIC (HEVC-coded, the iPhone default), generic HEIF, and AVIF. */
export type HeifFamilyType = "heic" | "heif" | "avif";

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const HEIF_BRANDS = new Set(["mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

function brandKind(brand: string): HeifFamilyType | null {
  if (AVIF_BRANDS.has(brand)) return "avif";
  if (HEIC_BRANDS.has(brand)) return "heic";
  if (HEIF_BRANDS.has(brand)) return "heif";
  return null;
}

/**
 * The HEIF-family kind of an ISO-BMFF file, from its `ftyp` box. A specific major brand (HEIC, AVIF) decides; a
 * generic or unknown one defers to the compatible brands — AVIF, then HEIC, then generic HEIF. MP4 and QuickTime
 * files carry none of these brands, which is what stops a HEIC photo being read as a video.
 */
export function sniffHeifFamily(bytes: Uint8Array): HeifFamilyType | null {
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const major = brandKind(ascii(bytes, 8, 12));
  if (major === "avif" || major === "heic") return major;
  const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const end = Math.min(bytes.length, boxSize);
  const compatible = new Set<HeifFamilyType>();
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    const kind = brandKind(ascii(bytes, offset, offset + 4));
    if (kind) compatible.add(kind);
  }
  if (compatible.has("avif")) return "avif";
  if (compatible.has("heic")) return "heic";
  return major ?? (compatible.has("heif") ? "heif" : null);
}

/** Every still-image container a phone, tablet or computer commonly hands a file picker. */
export type ConsumerImageType = SniffedImageType | HeifFamilyType | "gif" | "tiff";

export function sniffConsumerImageType(bytes: Uint8Array): ConsumerImageType | null {
  const image = sniffImageType(bytes);
  if (image) return image;
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) return "gif";
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    return "tiff";
  }
  return sniffHeifFamily(bytes);
}

/** Hosted-document kinds (lib/documents/upload.ts): web images, HEIF-family images, PDF and three video containers. */
export type SniffedDocumentType = SniffedImageType | HeifFamilyType | "pdf" | "mp4" | "quicktime" | "webm";

/**
 * The stored MIME types each sniffed kind may legitimately carry. Devices label HEIC and HEIF either way, and an
 * ISO-BMFF video either video type.
 */
const MIME_BY_KIND: Record<SniffedDocumentType, readonly string[]> = {
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  heic: ["image/heic", "image/heif"],
  heif: ["image/heif", "image/heic"],
  avif: ["image/avif"],
  pdf: ["application/pdf"],
  mp4: ["video/mp4", "video/quicktime"],
  quicktime: ["video/quicktime", "video/mp4"],
  webm: ["video/webm"],
};

const EBML_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3];

export function sniffDocumentType(bytes: Uint8Array): SniffedDocumentType | null {
  const image = sniffImageType(bytes);
  if (image) return image;
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return "pdf";
  const heif = sniffHeifFamily(bytes);
  if (heif) return heif;
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") return ascii(bytes, 8, 12) === "qt  " ? "quicktime" : "mp4";
  if (bytes.length >= 4 && EBML_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "webm";
  return null;
}

/** Whether bytes of `kind` may be stored as `mime`. */
export function sniffedTypeMatchesMime(kind: SniffedDocumentType | null, mime: string): boolean {
  return kind !== null && MIME_BY_KIND[kind].includes(mime);
}
