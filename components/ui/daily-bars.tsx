import { cn } from "@/lib/utils";
import type { DailyCount } from "@/lib/analytics/activity";
import { barSpec } from "@/lib/analytics/chart";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** "2026-07-07" → "JUL 7" without Date parsing (avoids any timezone shift). */
function tickLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d ?? ""}`;
}

/**
 * DailyBars — the finalized chart grammar (docs/brand/ui-language.md): history bars
 * in bone (#D8D3C8), exactly ONE brass current-period bar (the last), zero-value days
 * as 2px iron-200 stubs (never empty gaps), a 1px iron-200 baseline, 3px top corners,
 * sparse mono ticks, and a CSS-only mono value chip on hover/focus. No charting
 * dependency, no gridlines, no shadows. Decorative bars are aria-hidden; the chart
 * carries a single `role="img"` summary.
 */
export function DailyBars({
  data,
  summary,
  className,
}: {
  data: DailyCount[];
  summary: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const midIndex = Math.floor((data.length - 1) / 2);

  return (
    <div role="img" aria-label={summary} className={className}>
      <div className="flex h-24 items-end gap-1.5 border-b border-iron-200">
        {data.map((d, i) => {
          const spec = barSpec(d.count, max, i === data.length - 1);
          const isStub = spec.kind === "brass-stub" || spec.kind === "iron-stub";
          return (
            <div
              key={d.date}
              aria-hidden
              className="group relative flex flex-1 items-end justify-center"
            >
              <span className="pointer-events-none absolute -top-6 z-10 hidden whitespace-nowrap rounded-[5px] bg-iron-950 px-1.5 py-0.5 font-mono text-[10.5px] text-bone-50 group-hover:block group-focus-within:block">
                {d.count} · {tickLabel(d.date)}
              </span>
              {isStub ? (
                // 2px stub; the current period stays brass even at count 0.
                <span
                  className={cn(
                    "h-0.5 w-full",
                    spec.kind === "brass-stub" ? "bg-brass-500" : "bg-iron-200"
                  )}
                />
              ) : (
                <span
                  className={cn(
                    "w-full rounded-t-[3px]",
                    spec.kind === "brass" ? "bg-brass-500" : "bg-spark-bone"
                  )}
                  style={{ height: `${spec.heightPct}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      {data.length > 0 ? (
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-mono-meta">
          <span>{tickLabel(data[0].date)}</span>
          {data.length > 2 ? <span>{tickLabel(data[midIndex].date)}</span> : null}
          <span>TODAY</span>
        </div>
      ) : null}
    </div>
  );
}
