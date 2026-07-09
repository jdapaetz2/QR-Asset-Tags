import { Barlow, JetBrains_Mono } from "next/font/google";

/**
 * Brand webfonts (A1). Imported ONLY by admin/platform/marketing surfaces — never by the
 * root layout or the public scan tree — so `/t/[shortCode]` and `/forms/**` load ZERO
 * webfonts (BRAND.md rule 6). Each exposes a CSS variable; `globals.css` maps
 * `--font-sans`/`--font-mono` to these with a system fallback, so any surface that does not
 * apply these variables degrades to the system stack.
 *
 * Barlow has no Google variable font, so static weights are requested: 400 body, 500, 600
 * headings. JetBrains Mono is the brand mono for admin/marketing data (codes, IDs, URLs).
 */
export const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

/** Convenience: both brand-font variable classNames for a surface wrapper. */
export const brandFontVars = `${barlow.variable} ${jetbrainsMono.variable}`;
