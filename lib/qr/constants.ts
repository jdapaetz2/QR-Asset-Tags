/**
 * Pure QR rendering constants shared by the server SVG builder and the client
 * branded-export form. No `qrcode` import here, so it is safe to use in client
 * components (keeps the Node QR library out of the browser bundle).
 */

export const QUIET_ZONE = 4; // modules; never zero

export const SIZE_OPTIONS = ["1.5", "2.0", "2.5"] as const;
export type SizeInches = (typeof SIZE_OPTIONS)[number];

const WIDTH_BY_SIZE: Record<string, number> = {
  "1.5": 384,
  "2.0": 512,
  "2.5": 640,
};

/** Pixel width for the SVG (vector, so this is just the rendered box). Default 2.0in. */
export function svgWidthForSize(size: string | null | undefined): number {
  return WIDTH_BY_SIZE[size ?? ""] ?? WIDTH_BY_SIZE["2.0"];
}
