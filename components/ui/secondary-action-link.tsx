import Link from "next/link";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * The single page-level SECONDARY action treatment (Wave 3N.4.1). Built on the existing `buttonVariants`
 * outline variant so page-level shortcuts read as clear buttons — outlined, iron text, iron-200 border, accent
 * hover/focus (BRAND.md) — while staying real links (new-tab, copy address, keyboard, status bar all preserved).
 * `min-h-10` gives a ~40px touch target for page-level controls.
 *
 * - Internal navigation: use `<SecondaryActionLink href>` (a Next `Link`).
 * - File-download endpoints: keep a native `<a>` and pass `className={secondaryActionClass}` (never SPA-route a
 *   download).
 *
 * NOT for: tab/sub-navigation, breadcrumbs/back links, inline explanatory links, or dense table-row links.
 */
export const secondaryActionClass = cn(buttonVariants({ variant: "outline" }), "min-h-10");

export function SecondaryActionLink({
  href,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={cn(secondaryActionClass, className)} {...props}>
      {children}
    </Link>
  );
}
