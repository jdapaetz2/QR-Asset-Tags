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
