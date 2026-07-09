/**
 * Generic dashboard loading skeleton (Prompt D, designed states). Admin surface, so the shimmer
 * is fine. Kept generic (header + card placeholders) since it also covers dashboard child routes
 * that don't define their own loading state.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-7 w-52 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-24 animate-pulse rounded-lg border bg-muted/40" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
