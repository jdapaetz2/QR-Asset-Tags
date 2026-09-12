/**
 * The image type the BYTES say they are — never the extension or a declared MIME type. Pure, no I/O.
 *
 * Shared by the email preview transformer (lib/notifications/preview-image.ts) and the direct-upload verifier
 * (lib/forms/media-verify.ts), which reads only the first bytes of each uploaded object.
 */

export type SniffedImageType = "jpeg" | "png" | "webp";

/** How many leading bytes `sniffImageType` needs. */
export const SNIFF_BYTES = 12;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  return null;
}

/** Hosted-document kinds (lib/documents/upload.ts): the images above plus PDF and the three video containers. */
export type SniffedDocumentType = SniffedImageType | "pdf" | "mp4" | "quicktime" | "webm";

/** The stored MIME types each sniffed kind may legitimately carry. An ISO-BMFF `ftyp` file may be labelled either video type. */
const MIME_BY_KIND: Record<SniffedDocumentType, readonly string[]> = {
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
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
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") return ascii(bytes, 8, 12) === "qt  " ? "quicktime" : "mp4";
  if (bytes.length >= 4 && EBML_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "webm";
  return null;
}

/** Whether bytes of `kind` may be stored as `mime`. */
export function sniffedTypeMatchesMime(kind: SniffedDocumentType | null, mime: string): boolean {
  return kind !== null && MIME_BY_KIND[kind].includes(mime);
}
