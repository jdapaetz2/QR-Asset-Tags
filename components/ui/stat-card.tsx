import Link from "next/link";

import { cn } from "@/lib/utils";

/** A single metric tile (number + label). Becomes a link when `href` is given. */
export function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number | string;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </>
  );
  const base = "rounded-lg border bg-card p-4";
  if (!href) return <div className={base}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        base,
        "transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      )}
    >
      {body}
    </Link>
  );
}
