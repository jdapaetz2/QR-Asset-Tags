/**
 * Minimal image headers with a real frame size, for tests of the server verifiers, which read an image's dimensions
 * from its leading bytes (lib/media/classify.ts).
 */

/** A JFIF JPEG head: SOI, an APP0 segment, then a baseline frame header (SOF0) of `width` × `height`. */
export function jpegHead(width = 32, height = 16): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00,
  ]);
}

/** A PNG head: signature and IHDR chunk of `width` × `height`. */
export function pngHead(width = 32, height = 16): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([0x08, 0x02, 0x00, 0x00, 0x00], 24);
  return bytes;
}

export const JPEG_HEAD = jpegHead();
export const PNG_HEAD = pngHead();
