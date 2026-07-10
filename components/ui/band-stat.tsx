import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * BandStat — an in-band stat target (docs/brand/ui-language.md). Always a link to
 * a filtered view; a stat that links nowhere does not belong in the band, so
 * `href` is required. Mono number (18px, tabular) over a dotted-underline label,
 * with a hover/focus surface. Attention numbers render amber; an optional muted
 * `/total` suffix and an optional trailing child (e.g. a Sparkline) are supported.
 */
export function BandStat({
  value,
  total,
  label,
  href,
  attention = false,
  children,
  className,
}: {
  value: number | string;
  total?: number;
  label: string;
  href: string;
  attention?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-[8px] px-3 py-2 transition-colors hover:bg-iron-hover focus-visible:bg-iron-hover focus-visible:outline-none",
        className
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span
          className={cn(
            "font-mono text-lg leading-none tabular-nums",
            attention ? "text-attention" : "text-bone-50"
          )}
        >
          {value}
          {total !== undefined ? (
            <span className="text-mono-meta">/{total}</span>
          ) : null}
        </span>
        <span className="w-fit border-b border-dotted border-iron-600 pb-px text-[11px] text-band-label">
          {label}
        </span>
      </span>
      {children}
    </Link>
  );
}
