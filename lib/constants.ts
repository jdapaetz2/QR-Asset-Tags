/**
 * App-level constants. Product/branding strings live here so nothing
 * customer-specific is hard-coded into components. Per-organization
 * branding (logo, name, "Powered by" label) is data-driven from the
 * `organizations` table — see docs/DATA_MODEL.md.
 */
export const PRODUCT_NAME = "Mulemark";
export const PRODUCT_TAGLINE =
  "Permanent QR tags for rental equipment — scan to get the right info, every time.";

/**
 * Platform brand shown on public scan/form pages (the Mulemark mark + "Powered by
 * Mulemark" footer). Mulemark is the settled product name; this constant is the
 * public-facing platform presence. The footer renders the fixed wordmark artwork
 * (rendered uppercase as MULEMARK), so this is never a tenant-overridable string.
 */
export const PLATFORM_NAME = "Mulemark";

/**
 * Standard public-page disclaimer. Points users to the rental company and the
 * authoritative sources; it does NOT provide safety instructions and does not
 * imply that Mulemark validates safe operation.
 */
export const PUBLIC_DISCLAIMER =
  "Information is provided by the rental company. Always follow manufacturer instructions, rental agreement terms, and applicable safety requirements.";
