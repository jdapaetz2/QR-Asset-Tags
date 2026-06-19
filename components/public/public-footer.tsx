import { PRODUCT_NAME, PUBLIC_DISCLAIMER } from "@/lib/constants";

/**
 * Shared footer for every public surface (equipment page, forms, thanks,
 * unavailable). Shows the configurable powered-by label (falling back to the
 * product name) and the standard disclaimer — one source of truth so the copy
 * stays consistent. Branding is data-driven; nothing customer-specific is
 * hard-coded.
 */
export function PublicFooter({
  poweredByLabel,
}: {
  poweredByLabel?: string | null;
}) {
  return (
    <footer className="mt-auto border-t pt-4 text-center text-xs text-muted-foreground">
      <p>{poweredByLabel ?? `Powered by ${PRODUCT_NAME}`}</p>
      <p className="mt-1">{PUBLIC_DISCLAIMER}</p>
    </footer>
  );
}
