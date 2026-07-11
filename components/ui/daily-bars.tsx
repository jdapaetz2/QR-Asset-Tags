import { cn } from "@/lib/utils";
import type { DailyCount } from "@/lib/analytics/activity";
import { barSpec, chartMax, chartDensity, dataStartNote } from "@/lib/analytics/chart";

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
  const max = chartMax(data);
  const midIndex = Math.floor((data.length - 1) / 2);
  const startNote = dataStartNote(data);

  return (
    <div role="img" aria-label={summary} className={className}>
      <div
        className={cn(
          "flex h-24 items-end border-b border-iron-200",
          // Gap tightens as the bucket count grows so 90 daily bars stay readable.
          chartDensity(data.length)
        )}
      >
        {data.map((d, i) => {
          const spec = barSpec(d.count, max, i === data.length - 1);
          const isStub = spec.kind === "brass-stub" || spec.kind === "iron-stub";
          return (
            <div
              key={d.date}
              aria-hidden
              // h-full gives each column a definite height (the row is h-24 = 96px), so the
              // bar's percentage height resolves instead of collapsing to a stub.
              className="group relative flex h-full flex-1 items-end justify-center"
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
      {startNote ? (
        // Quiet note when the range starts before any activity (e.g. the 90-day view of a
        // young account). Not a warning — the data isn't missing, it just doesn't exist yet.
        <p className="mt-1.5 text-[11px] text-mono-meta">{startNote}</p>
      ) : null}
    </div>
  );
}
