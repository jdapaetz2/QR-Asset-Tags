import type { Metadata } from "next";

import { PublicScanRoute } from "@/components/public/public-scan-route";

/**
 * No-JavaScript copy of /t/[shortCode] (lib/public/nojs.ts): the same page with no loading boundary above it, so the
 * whole document renders in order. Reached through the `?nojs=1` rewrite after the normal route's skeleton could not
 * be swapped out — that first request already recorded this visit's scan, so this render records none.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

export default async function NoJavaScriptScanPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  return <PublicScanRoute shortCode={shortCode} recordScan={false} />;
}
