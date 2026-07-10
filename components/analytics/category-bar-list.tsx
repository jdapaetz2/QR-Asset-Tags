import { cn } from "@/lib/utils";
import type { CategoryCount } from "@/lib/analytics/insights";

/**
 * CategoryBarList — scans/submissions by category (docs/brand/ui-language.md chart
 * grammar): track #EFEDE7, iron-600 fill, **brass reserved for the leader only**,
 * mono value right-aligned. Top four rows are always shown; any remainder collapses
 * behind a native <details> "Show all" (no client JS).
 */
function Row({ c, leader, max }: { c: CategoryCount; leader: boolean; max: number }) {
  const pct = Math.max(2, Math.round((c.count / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="truncate">{c.category}</span>
        <span className="font-mono text-[12.5px] text-iron-600">{c.count}</span>
      </div>
      <div className="mb-2.5 h-[7px] overflow-hidden rounded bg-[#EFEDE7]">
        <div
          className={cn("h-full rounded", leader ? "bg-brass-500" : "bg-iron-600")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CategoryBarList({
  rows,
  emptyLabel = "No activity in this range yet.",
}: {
  rows: CategoryCount[];
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-iron-600">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  const top = rows.slice(0, 4);
  const rest = rows.slice(4);

  return (
    <div>
      {top.map((c, i) => (
        <Row key={c.category} c={c} leader={i === 0} max={max} />
      ))}
      {rest.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[12px] font-medium text-brass-600">
            Show all {rows.length} categories
          </summary>
          <div className="mt-2.5">
            {rest.map((c) => (
              <Row key={c.category} c={c} leader={false} max={max} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
