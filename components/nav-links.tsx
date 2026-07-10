"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/auth/nav";

/**
 * Primary nav with a brass active-route underline (docs/brand/dashboard-reference.html).
 * Presentation only — the items (and the customer/owner boundary) come from navForRole;
 * this never changes which links show. `badgeCounts` supplies live counts for items that
 * declare a `badge` (e.g. the Submissions "new" count); a zero count renders no badge.
 */
export function NavLinks({
  items,
  badgeCounts = {},
}: {
  items: NavItem[];
  badgeCounts?: Record<string, number>;
}) {
  const pathname = usePathname();

  // Longest matching href wins, so /dashboard/assets highlights "Assets" rather than
  // the "/dashboard" root item (which would otherwise prefix-match every sub-route).
  const matchLen = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) ? href.length : -1;
  const bestLen = Math.max(...items.map((i) => matchLen(i.href)), -1);

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {items.map((item) => {
        const active = matchLen(item.href) === bestLen && bestLen >= 0;
        const count = item.badge ? badgeCounts[item.badge] ?? 0 : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-0.5 py-1 transition-colors",
              active
                ? "border-brass-500 font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
            {item.badge && count > 0 ? (
              <span className="rounded-md bg-brass-500 px-1.5 py-px text-[10.5px] font-medium tabular-nums text-bone-50">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
