import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/constants";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: PRODUCT_TAGLINE,
};

/**
 * Root layout intentionally loads NO webfonts. Brand fonts (Barlow / JetBrains Mono)
 * are applied only by admin/platform/marketing surfaces via `app/fonts.ts`, so the
 * public scan tree (`/t/**`, `/forms/**`), which inherits only this layout, renders in
 * the system stack with zero webfont requests (BRAND.md rule 6). `--font-sans` falls
 * back to the system stack whenever the brand-font variables are absent.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}