import QRCode from "qrcode";

/**
 * Scan-safe QR SVG generation for the platform-admin production workspace.
 *
 * Defaults are the "Scan-safe equipment tag" preset: black on white, square
 * modules + finder eyes (standard QR), high error correction (H), quiet zone of
 * 4 modules, no logo/styling. URLs passed in are always the computed
 * `${base}/t/${short_code}` (never the stored `public_url`).
 */

export const QUIET_ZONE = 4; // modules; never zero
const FG = "#000000";
const BG = "#ffffff";

export const EC_OPTIONS = ["M", "Q", "H"] as const;
export type ErrorCorrection = (typeof EC_OPTIONS)[number];

/** Default to H; reject L (too little redundancy for equipment tags) and junk. */
export function normalizeErrorCorrection(level: string | null | undefined): ErrorCorrection {
  return (EC_OPTIONS as readonly string[]).includes(level ?? "")
    ? (level as ErrorCorrection)
    : "H";
}

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

function sanitizeSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tag"
  );
}

/** Safe download filename: `<asset-code>-<short-code>.svg`. */
export function sanitizeSvgFilename(assetCode: string, shortCode: string): string {
  return `${sanitizeSegment(assetCode)}-${sanitizeSegment(shortCode)}.svg`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type QrSvgOptions = { ec?: string | null; size?: string | null };

/** Single scan-safe QR SVG encoding `url`. */
export async function buildQrSvg(url: string, options: QrSvgOptions = {}): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: normalizeErrorCorrection(options.ec),
    margin: QUIET_ZONE,
    width: svgWidthForSize(options.size),
    color: { dark: FG, light: BG },
  });
}

export type QrSheetItem = { label: string; url: string };

/**
 * Combined SVG sheet of multiple QR codes (the no-ZIP batch option). Each QR is a
 * nested QR SVG placed in a grid with an XML-escaped label beneath it.
 */
export async function buildQrSheetSvg(
  items: QrSheetItem[],
  options: QrSvgOptions = {}
): Promise<string> {
  const ec = normalizeErrorCorrection(options.ec);
  const qr = svgWidthForSize(options.size);
  const pad = Math.round(qr * 0.12);
  const labelH = Math.round(qr * 0.12);
  const cellW = qr + pad * 2;
  const cellH = qr + pad + labelH;
  const cols = Math.min(items.length, 3) || 1;
  const rows = Math.ceil(items.length / cols);
  const fontSize = Math.max(12, Math.round(qr * 0.07));

  const cells = await Promise.all(
    items.map(async (item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW + pad;
      const y = row * cellH + pad;
      const inner = await QRCode.toString(item.url, {
        type: "svg",
        errorCorrectionLevel: ec,
        margin: QUIET_ZONE,
        width: qr,
        color: { dark: FG, light: BG },
      });
      return `<g transform="translate(${x},${y})">${inner}<text x="${qr / 2}" y="${
        qr + labelH * 0.8
      }" font-family="monospace" font-size="${fontSize}" text-anchor="middle" fill="${FG}">${xmlEscape(
        item.label
      )}</text></g>`;
    })
  );

  const width = cols * cellW;
  const height = rows * cellH;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${BG}"/>${cells.join(
    ""
  )}</svg>`;
}
