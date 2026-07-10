import Link from "next/link";

import { cn } from "@/lib/utils";
import { RANGES, type Range } from "@/lib/analytics/range";

/**
 * RangeControl — segmented 7/30/90-day selector (docs/brand/ui-language.md). It
 * drives every analytics module via the `?range=` query param and preserves the
 * active `?sort=`. Server component: each segment is a plain Link (no client JS).
 */
export function RangeControl({ range, sort }: { range: Range; sort?: string }) {
  const href = (r: Range) => {
    const qs = new URLSearchParams({ range: String(r) });
    if (sort) qs.set("sort", sort);
    return `/dashboard/analytics?${qs.toString()}`;
  };

  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex overflow-hidden rounded-[8px] border border-iron-200 bg-white"
    >
      {RANGES.map((r, i) => {
        const active = r === range;
        return (
          <Link
            key={r}
            href={href(r)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "px-3.5 py-1.5 text-[13px] transition-colors",
              i > 0 && "border-l border-iron-200",
              active
                ? "bg-iron-950 font-semibold text-bone-50"
                : "text-iron-600 hover:bg-accent"
            )}
          >
            {r} days
          </Link>
        );
      })}
    </div>
  );
}
