"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

import type { SessionFilters } from "@/lib/rentals/session-browser";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "returned", label: "Returned" },
];
const RANGE_OPTIONS = [
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
 * URL-driven "History tools" disclosure for the rental-session browser (Phase 3C.8, Part J). Native GET form →
 * bookmarkable query params, resets pagination. Closed by default; open when a filter is active. Keeps an
 * `?asset=` prefilter across applies via a hidden field.
 */
export function SessionFiltersCard({ filters }: { filters: SessionFilters }) {
  const pathname = usePathname();

  return (
    <details open={filters.active || undefined} className="rounded-lg border bg-card" data-history-tools>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>History tools</span>
        <span aria-hidden className="text-xs text-muted-foreground">
          Search &amp; filter
        </span>
      </summary>
      <form method="get" action={pathname} className="flex flex-col gap-3 border-t px-4 py-4">
        {filters.assetId ? <input type="hidden" name="asset" value={filters.assetId} /> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Session reference</span>
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              maxLength={32}
              placeholder="RNT-YYYY-XXXXXX"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Asset code or name</span>
            <input
              type="search"
              name="asset_q"
              defaultValue={filters.assetSearch}
              maxLength={40}
              placeholder="AT-1024 or Excavator"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Renter or customer</span>
            <input
              type="search"
              name="renter_q"
              defaultValue={filters.renterSearch}
              maxLength={40}
              placeholder="Acme Crew"
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <select name="status" defaultValue={filters.status} className={inputClass}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Started from</span>
            <input type="date" name="from" defaultValue={filters.from ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Started to</span>
            <input type="date" name="to" defaultValue={filters.to ?? ""} className={inputClass} />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
          <span className="text-xs font-medium text-muted-foreground">Date preset</span>
          <select name="range" defaultValue={filters.range} className={inputClass}>
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

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
            href={filters.assetId ? `${pathname}?asset=${filters.assetId}` : pathname}
            className="inline-flex min-h-9 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            Clear
          </Link>
        </div>
      </form>
    </details>
  );
}
