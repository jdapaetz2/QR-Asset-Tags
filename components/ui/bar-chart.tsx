import type { DailyCount } from "@/lib/analytics/activity";

/**
 * Tiny server-rendered trend chart — one CSS bar per day, height proportional to the
 * series max. No client JS and no charting library; hover shows date + count via the
 * native title tooltip.
 */
export function BarChart({ data }: { data: DailyCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-24 items-end gap-0.5" aria-hidden>
      {data.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.count}`}
          className="flex-1 rounded-sm bg-foreground/70"
          style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
