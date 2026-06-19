import QRCode from "qrcode";

import { QUIET_ZONE, SIZE_OPTIONS, svgWidthForSize } from "@/lib/qr/constants";

/**
 * Scan-safe QR SVG generation for the platform-admin production workspace.
 *
 * Defaults are the "Scan-safe equipment tag" preset: black on white, square
 * modules + finder eyes (standard QR), high error correction (H), quiet zone of
 * 4 modules, no logo/styling. URLs passed in are always the computed
 * `${base}/t/${short_code}` (never the stored `public_url`).
 */

// Re-exported so existing importers can keep importing from "@/lib/qr/svg".
export { QUIET_ZONE, SIZE_OPTIONS, svgWidthForSize };
export type { SizeInches } from "@/lib/qr/constants";

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

/** A logo to overlay: a self-contained data URI + size as % of the QR. */
export type QrLogo = { dataUri: string; pct: number };

export type QrSvgOptions = {
  ec?: string | null;
  size?: string | null;
  fg?: string | null;
  bg?: string | null;
  logo?: QrLogo | null;
};

function normalizeColor(value: string | null | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

/**
 * Single QR SVG encoding `url`. Scan-safe by default (black/white, square, quiet
 * zone). Optional fg/bg colors and a centered logo (with a knockout background)
 * for Branded mode — the logo is composed into a self-contained SVG (data URI).
 */
export async function buildQrSvg(url: string, options: QrSvgOptions = {}): Promise<string> {
  const ec = normalizeErrorCorrection(options.ec);
  const dark = normalizeColor(options.fg, FG);
  const light = normalizeColor(options.bg, BG);

  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: ec,
    margin: QUIET_ZONE,
    width: svgWidthForSize(options.size),
    color: { dark, light },
  });

  if (!options.logo?.dataUri || options.logo.pct <= 0) return svg;

  // viewBox is "0 0 N N" where N = module count + 2 * quiet zone; place the logo
  // in those units so it scales with the rendered SVG.
  const moduleCount = QRCode.create(url, { errorCorrectionLevel: ec }).modules.size;
  const n = moduleCount + QUIET_ZONE * 2;
  const logoSize = (n * Math.min(options.logo.pct, 20)) / 100;
  const logoXY = (n - logoSize) / 2;
  const knockout = logoSize * 1.18;
  const knockoutXY = (n - knockout) / 2;

  const overlay =
    `<rect x="${knockoutXY}" y="${knockoutXY}" width="${knockout}" height="${knockout}" rx="${
      knockout * 0.12
    }" fill="${light}"/>` +
    `<image x="${logoXY}" y="${logoXY}" width="${logoSize}" height="${logoSize}" ` +
    `href="${options.logo.dataUri}" preserveAspectRatio="xMidYMid meet"/>`;

  return svg.replace("</svg>", `${overlay}</svg>`);
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
