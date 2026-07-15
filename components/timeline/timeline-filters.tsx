"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

import type { TimelineFilters } from "@/lib/timeline/cursor";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All events" },
  { value: "rental", label: "Rental activity" },
  { value: "inspections", label: "Inspections and returns" },
  { value: "damage_support", label: "Damage and support" },
  { value: "acknowledgements", label: "Acknowledgements" },
  { value: "tag_requests", label: "Tag requests" },
];

const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "1y", label: "Last year" },
  { value: "custom", label: "Custom range" },
];

const inputClass =
  "min-w-0 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Compact URL-driven "History tools" disclosure (Phase 3C.8, Part G). A native GET form: applying navigates to
 * the same path with query params (bookmarkable, Back/Forward restores, resets pagination to page one).
 * Closed by default; open when any filter is active. Clear links back to the bare path.
 */
export function TimelineFilters({ filters }: { filters: TimelineFilters }) {
  const pathname = usePathname();

  return (
    <details
      open={filters.active || undefined}
      className="rounded-lg border bg-card"
      data-history-tools
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>History tools</span>
        <span aria-hidden className="text-xs text-muted-foreground">
          Search &amp; filter
        </span>
      </summary>
      <form method="get" action={pathname} className="flex flex-col gap-3 border-t px-4 py-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Search reference</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            maxLength={32}
            placeholder="Search RNT or SUB reference"
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Event type</span>
            <select name="type" defaultValue={filters.type} className={inputClass}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Date range</span>
            <select name="range" defaultValue={filters.range} className={inputClass}>
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">From</span>
            <input type="date" name="from" defaultValue={filters.from ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">To</span>
            <input type="date" name="to" defaultValue={filters.to ?? ""} className={inputClass} />
          </label>
        </div>

        {filters.invalidRange ? (
          <p role="alert" className="text-xs text-destructive">
            That date range isn’t valid (the start must be on or before the end). Showing all time.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply filters
          </button>
          <Link
            href={pathname}
            className="inline-flex min-h-9 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            Clear
          </Link>
        </div>
      </form>
    </details>
  );
}
