import Link from "next/link";

/**
 * A labeled horizontal bar (label + count + proportional fill). Becomes a drill-through
 * link when `href` is given. Presentational only — width is computed from `max`.
 */
export function StatBar({
  label,
  value,
  max,
  href,
}: {
  label: string;
  value: number;
  max: number;
  href?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const body = (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/70"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );

  if (!href) return <div className="px-2 py-1.5">{body}</div>;
  return (
    <Link
      href={href}
      className="block rounded-md px-2 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {body}
    </Link>
  );
}
