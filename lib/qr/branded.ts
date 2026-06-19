/**
 * Pure helpers for Branded QR mode + scanability guardrails. No I/O.
 *
 * Product rule: scanability beats styling. Branded mode is optional; scan-safe
 * (black/white, square, EC H, quiet zone) stays the default. A logo always
 * forces error correction H (enforced server-side too).
 */

export const BRANDED_EC_OPTIONS = ["Q", "H"] as const;
export type BrandedEc = (typeof BRANDED_EC_OPTIONS)[number];

/** Branded mode allows Q or H only; default H; never L. */
export function normalizeBrandedEc(level: string | null | undefined): BrandedEc {
  return (BRANDED_EC_OPTIONS as readonly string[]).includes(level ?? "")
    ? (level as BrandedEc)
    : "H";
}

export const LOGO_SAFE_PCT = 15;
export const LOGO_MAX_PCT = 20;

/** Clamp a logo size percentage to [0, LOGO_MAX_PCT]; default to the safe size. */
export function clampLogoPercent(pct: number | null | undefined): number {
  if (typeof pct !== "number" || Number.isNaN(pct)) return LOGO_SAFE_PCT;
  return Math.min(LOGO_MAX_PCT, Math.max(0, Math.round(pct)));
}

export const LOGO_ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export function validateLogoFile(file: { type: string; size: number }): string | null {
  if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return "Logo must be a PNG, JPEG, WebP, or SVG image.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return "Logo must be 2 MB or smaller.";
  }
  return null;
}

// --- Contrast --------------------------------------------------------------

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const ch = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio (1–21). Returns 1 for unparseable input. */
export function contrastRatio(fg: string, bg: string): number {
  const a = parseHex(fg);
  const b = parseHex(bg);
  if (!a || !b) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** QR codes need strong contrast; recommend a high ratio for engraved/dirty tags. */
export const MIN_RECOMMENDED_CONTRAST = 7;

export function colorWarnings(fg: string, bg: string): string[] {
  const warnings: string[] = [];
  const fgC = parseHex(fg);
  const bgC = parseHex(bg);
  if (!fgC || !bgC) return warnings;

  if (relativeLuminance(fgC) > relativeLuminance(bgC)) {
    warnings.push(
      "Inverted QR (light modules on a dark background) — many scanners struggle; test carefully."
    );
  }
  if (contrastRatio(fg, bg) < MIN_RECOMMENDED_CONTRAST) {
    warnings.push(
      "Low contrast between foreground and background — reduces scan reliability."
    );
  }
  if (bgC.r !== 255 || bgC.g !== 255 || bgC.b !== 255) {
    warnings.push(
      "Non-white background — keep physical tags opaque and high-contrast; never transparent."
    );
  }
  return warnings;
}

// --- Combined guardrail warnings ------------------------------------------

export type BrandedWarningInput = {
  hasLogo: boolean;
  ec: string;
  logoPct: number;
  sizeInches: string;
  baseIsProd: boolean;
  fg: string;
  bg: string;
};

export function brandedWarnings(input: BrandedWarningInput): string[] {
  const warnings: string[] = [];
  if (input.hasLogo && input.ec !== "H") {
    warnings.push(
      "A logo needs error correction H — it will be forced to H on export."
    );
  }
  if (input.hasLogo && input.logoPct > LOGO_SAFE_PCT) {
    warnings.push(
      `Logo larger than ${LOGO_SAFE_PCT}% of the QR can obscure data — keep it small and require error correction H.`
    );
  }
  if (input.hasLogo && input.sizeInches === "1.5") {
    warnings.push(
      "Small physical size with a logo is risky — prefer 2.0 in or larger."
    );
  }
  if (!input.baseIsProd) {
    warnings.push(
      "Base URL looks like localhost or a preview — do not use for physical tags unless intentional."
    );
  }
  warnings.push(...colorWarnings(input.fg, input.bg));
  return warnings;
}

export const SCAN_CHECKLIST = [
  "Print or engrave a sample tag.",
  "Scan from about 12 inches away.",
  "Scan at an angle.",
  "Scan under poor lighting.",
  "Test after smudging or scratching the sample.",
] as const;

export const SCAN_DISCLAIMER =
  "Scanning is not guaranteed — always test a physical sample before producing tags in bulk.";

export const RECOMMENDED_PHYSICAL_NOTE =
  "Recommended physical tag size: 2.0 in or larger for branded/logo tags. Final size must be tested after engraving/printing.";
