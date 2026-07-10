import { cn } from "@/lib/utils";
import type {
  ActivitySummary,
  AnalyticsFormType,
} from "@/lib/analytics/activity";
import { ANALYTICS_FORM_TYPES } from "@/lib/analytics/activity";
import { FORM_TYPE_LABELS } from "@/lib/submissions/display";

/**
 * SubmissionsCard — the submissions composition (docs/brand/ui-language.md): a
 * stacked status bar wearing the attention semantics (New amber / Reviewed iron /
 * Resolved green / Archived light), a legend with counts, and a type breakdown.
 * All counts are range-scoped (the New count is range-scoped by design and is a
 * different metric from the global nav badge — see the analytics page note).
 */
const STATUS_SEGMENTS = [
  { key: "new", label: "New", cls: "bg-warning" },
  { key: "reviewed", label: "Reviewed", cls: "bg-iron-600" },
  { key: "resolved", label: "Resolved", cls: "bg-success" },
  { key: "archived", label: "Archived", cls: "bg-spark-bone" },
] as const;

export function SubmissionsCard({
  byStatus,
  byType,
}: {
  byStatus: ActivitySummary["byStatus"];
  byType: Record<AnalyticsFormType, number>;
}) {
  const total = STATUS_SEGMENTS.reduce((n, s) => n + (byStatus[s.key] ?? 0), 0);

  return (
    <div>
      {/* Stacked status bar */}
      <div className="mb-3 flex h-3.5 overflow-hidden rounded-full bg-iron-200">
        {total > 0
          ? STATUS_SEGMENTS.map((s) => {
              const n = byStatus[s.key] ?? 0;
              if (n === 0) return null;
              return (
                <div
                  key={s.key}
                  className={cn("h-full", s.cls)}
                  style={{ width: `${(n / total) * 100}%` }}
                />
              );
            })
          : null}
      </div>

      {/* Legend with counts */}
      <ul className="flex flex-col gap-1 text-[13px]">
        {STATUS_SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-[2px]", s.cls)}
            />
            <span>{s.label}</span>
            <span className="ml-auto font-mono text-[12.5px] text-iron-600">
              {byStatus[s.key] ?? 0}
            </span>
          </li>
        ))}
      </ul>

      {/* Type breakdown */}
      <div className="mt-2.5 border-t border-[#EFEDE7] pt-2.5">
        <ul className="flex flex-col gap-1 text-[13px]">
          {ANALYTICS_FORM_TYPES.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span>{FORM_TYPE_LABELS[t]}</span>
              <span className="ml-auto font-mono text-[12.5px] text-iron-600">
                {byType[t] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
