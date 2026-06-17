/**
 * Build the public scan URL for a QR link. Always computed from the configured
 * base URL + the durable short_code — the stored `qr_links.public_url` is NOT
 * trusted for display/copy/export (it can hold stale placeholder hosts).
 */
export function buildPublicQrUrl(baseUrl: string, shortCode: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/t/${shortCode}`;
}
