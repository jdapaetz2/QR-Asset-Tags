import { PLATFORM_NAME, PUBLIC_DISCLAIMER } from "@/lib/constants";
import { BrandGlyph, BrandWordmark } from "@/components/brand/brand";

/**
 * Shared footer for every public surface (equipment page, forms, thanks,
 * unavailable). The platform presence is the fixed MuleMark mark (BRAND.md rule 3):
 * the iron tag glyph + MULEMARK wordmark (authoritative pure-SVG outline artwork —
 * zero webfonts, no brass on tenant pages; the rivet hole stays transparent) with a
 * quiet "Powered by MuleMark" descriptor, then the standard disclaimer. It is a fixed
 * platform mark, not a tenant-overridable string, and stays secondary to the rental
 * company's brand at the top of the page. Plain text, not a link.
 */
export function PublicFooter() {
  return (
    <footer className="mt-auto border-t pt-5 text-center text-xs text-iron-600">
      <div className="flex items-center justify-center gap-2">
        <BrandGlyph
          tone="currentColor"
          title=""
          className="h-4 w-auto opacity-90"
        />
        <BrandWordmark title={PLATFORM_NAME} className="h-3.5 w-auto" />
      </div>
      <p className="mt-1.5">Powered by {PLATFORM_NAME}</p>
      <p className="mt-2 text-iron-600/90">{PUBLIC_DISCLAIMER}</p>
    </footer>
  );
}
