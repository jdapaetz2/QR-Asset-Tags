/**
 * App-level constants. Product/branding strings live here so nothing
 * customer-specific is hard-coded into components. Per-organization
 * branding (logo, name, "Powered by" label) is data-driven from the
 * `organizations` table — see docs/DATA_MODEL.md.
 */
export const PRODUCT_NAME = "AssetTag QR";
export const PRODUCT_TAGLINE =
  "Permanent QR tags for rental equipment — scan to get the right info, every time.";

/**
 * Standard public-page disclaimer. Points users to the rental company and the
 * authoritative sources; it does NOT provide safety instructions and does not
 * imply that AssetTag QR validates safe operation.
 */
export const PUBLIC_DISCLAIMER =
  "Information is provided by the rental company. Always follow manufacturer instructions, rental agreement terms, and applicable safety requirements.";
