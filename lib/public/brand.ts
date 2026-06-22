/**
 * Safe organization brand-color handling for the public scanner page. No I/O.
 *
 * `organizations.primary_color` is customer-controlled text, so it is never
 * placed into markup directly — it is validated to a strict `#RRGGBB` hex (or a
 * safe default) before being used as an inline CSS custom property. A companion
 * helper picks a legible text color for a brand-colored surface so we never put
 * unreadable text on an arbitrary brand color.
 */

/** Neutral default accent for orgs with no/invalid brand color. */
export const DEFAULT_BRAND_COLOR = "#0f172a";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Strict `#RRGGBB` test — the only color shape we accept from user input. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/**
 * Return `value` only if it is a strict `#RRGGBB` hex; otherwise `fallback`.
 * Never returns untrusted text — the output is always a known-safe hex.
 */
export function safeBrandColor(
  value: string | null | undefined,
  fallback: string = DEFAULT_BRAND_COLOR
): string {
  return isHexColor(value) ? value : fallback;
}

/** Relative luminance (0–1) of a validated `#RRGGBB` hex, per WCAG. */
function luminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Legible text color (`#ffffff` or near-black) for text placed on top of the
 * given brand color — so brand-colored buttons stay readable regardless of hue.
 * Input is sanitized first, so junk falls back to white-on-dark.
 */
export function readableTextOn(color: string): string {
  const hex = safeBrandColor(color);
  return luminance(hex) > 0.55 ? "#0f172a" : "#ffffff";
}
