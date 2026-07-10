import { cn } from "@/lib/utils";

/**
 * Sparkline — a tiny CSS bar chart (docs/brand/ui-language.md), no charting
 * dependency. History bars are muted; the current (last) period is brass. No
 * axes or tooltips at this size; it carries an accessible `aria-label` summary.
 * `variant` picks the history-bar color for iron vs bone surfaces.
 */
export function Sparkline({
  values,
  variant = "iron",
  label,
  className,
}: {
  values: number[];
  variant?: "iron" | "bone";
  label: string;
  className?: string;
}) {
  const max = Math.max(1, ...values);
  const historyBg = variant === "iron" ? "bg-spark-iron" : "bg-spark-bone";
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("flex h-6 items-end gap-0.5", className)}
    >
      {values.map((v, i) => {
        const isCurrent = i === values.length - 1;
        // Floor high enough that every muted bar stays visible against the iron band
        // (a lone brass bar over near-invisible history reads as a stray dash).
        const pct = Math.max(28, Math.round((v / max) * 100));
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              "w-[5px] rounded-[1.5px]",
              isCurrent ? "bg-brass-500" : historyBg
            )}
            style={{ height: `${pct}%` }}
          />
        );
      })}
    </span>
  );
}
