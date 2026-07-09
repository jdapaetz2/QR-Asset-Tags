/**
 * Skeleton shown while the submissions inbox loads (Prompt C, designed states). Admin surface,
 * so the shimmer is fine; it mirrors the header + filter + table layout to avoid a jump.
 */
export default function SubmissionsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="h-8 w-44 animate-pulse rounded bg-muted" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="h-16 animate-pulse rounded-lg border bg-muted/40" />
      <div className="overflow-hidden rounded-lg border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b p-3 last:border-0">
            <div className="size-12 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
