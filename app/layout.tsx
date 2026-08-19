import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/constants";
import { publicEnv } from "@/lib/env";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Canonical origin for metadata (Phase B3). Derived from `NEXT_PUBLIC_SITE_URL` so each environment
 * describes itself — production says `https://mulemark.io`, preview says its own staging host, and a
 * preview deployment can never advertise production URLs.
 *
 * Deliberately tolerant: metadata is evaluated at build time, and `publicEnv.siteUrl` throws when the
 * variable is missing or malformed. Falling back to `undefined` (Next then emits relative URLs, the
 * behaviour before this phase) keeps a misconfigured env from failing the whole build — the strict
 * checks belong to `verify:production-config` and `verify:tag-config`, which fail loudly on purpose.
 */
function canonicalMetadataBase(): URL | undefined {
  try {
    return new URL(publicEnv.siteUrl);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: canonicalMetadataBase(),
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