import { productionBaseUrlIssue } from "@/lib/qr/production";

/**
 * Fail-closed guard for durable QR/tag output routes (SVG, sheet, CSV). A permanent
 * physical tag must encode a production-safe base URL, so if the configured base URL
 * is unsafe (http, localhost/placeholder, or a Vercel preview host) these routes
 * refuse to emit — unless the caller explicitly acknowledges an unsafe TEST export
 * with `?unsafe=1`. Returns a 400 Response to return early, or null when output is
 * allowed. `baseUrl` (NEXT_PUBLIC_SITE_URL) is public, not a secret.
 */
export function productionOutputBlock(
  baseUrl: string,
  acknowledgedUnsafe: boolean
): Response | null {
  const issue = productionBaseUrlIssue(baseUrl);
  if (!issue || acknowledgedUnsafe) return null;
  return new Response(
    `Base URL ${baseUrl} ${issue} — not production-safe for physical tags. ` +
      `Set NEXT_PUBLIC_SITE_URL to the production domain, or append ?unsafe=1 to export for testing only.`,
    { status: 400 }
  );
}
