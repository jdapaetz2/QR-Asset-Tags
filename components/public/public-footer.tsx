import { PRODUCT_NAME, PUBLIC_DISCLAIMER } from "@/lib/constants";
import { BrandGlyph } from "@/components/brand/brand";

/**
 * Shared footer for every public surface (equipment page, forms, thanks,
 * unavailable). The platform presence here is deliberately quiet (BRAND.md rule 3):
 * a small iron glyph (currentColor → iron-600, never brass on tenant pages; the
 * rivet hole stays transparent) beside the configurable powered-by label, plus the
 * standard disclaimer. Plain text, not a link. Branding is data-driven; nothing
 * customer-specific is hard-coded.
 */
export function PublicFooter({
  poweredByLabel,
}: {
  poweredByLabel?: string | null;
}) {
  return (
    <footer className="mt-auto border-t pt-4 text-center text-xs text-iron-600">
      <p className="flex items-center justify-center gap-1.5">
        <BrandGlyph tone="currentColor" title="" className="h-3 w-auto opacity-80" />
        <span>{poweredByLabel ?? `Powered by ${PRODUCT_NAME}`}</span>
      </p>
      <p className="mt-1">{PUBLIC_DISCLAIMER}</p>
    </footer>
  );
}
