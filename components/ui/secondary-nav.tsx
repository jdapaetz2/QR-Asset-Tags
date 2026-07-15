import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Compact, wrapping secondary-navigation row (Wave 3N.2). Presentational only —
 * the caller supplies the items and marks which one (if any) is `active`, so this
 * works in server components with no pathname hook. Used for the Assets-area
 * destinations and the per-asset sub-navigation. Quiet by design: no brass
 * accent (the hierarchy law reserves brass for the primary nav), iron-600 with a
 * foreground active state.
 */

export type SecondaryNavItem = {
  label: string;
  href: string;
  active?: boolean;
};

export function SecondaryNav({
  items,
  ariaLabel = "Secondary",
  className,
}: {
  items: SecondaryNavItem[];
  ariaLabel?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-sm",
        className
      )}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "border-b-2 py-0.5 transition-colors",
            item.active
              ? "border-iron-400 font-medium text-foreground"
              : "border-transparent text-iron-600 hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
