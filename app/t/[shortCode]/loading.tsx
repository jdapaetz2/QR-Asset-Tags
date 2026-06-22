/**
 * Route-level loading fallback for the public scanner page. Pure-CSS skeleton
 * (no client libraries) so the page feels instant while the server resolves the
 * asset and signs document URLs. Scan logging stays best-effort in page.tsx.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pb-28 pt-6 sm:pb-6">
      <div className="h-1.5 w-full rounded-full bg-muted" />

      {/* Org header */}
      <div className="flex items-center gap-3">
        <div className="size-10 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>

      {/* Hero card */}
      <div className="aspect-video w-full animate-pulse rounded-lg bg-muted" />

      {/* Identity */}
      <div className="flex flex-col gap-2">
        <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </main>
  );
}
