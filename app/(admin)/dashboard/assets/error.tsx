"use client";

/**
 * Error boundary for the Assets list (Phase C2). Mirrors the submissions inbox boundary.
 *
 * This exists because the alternative is worse than an error: before C2 a failed `assets` query was
 * discarded and rendered as an empty list, so a database problem looked exactly like "this
 * organization has no equipment". An operator cannot tell those apart, and the wrong one is quietly
 * reassuring. Saying "couldn't load" is the honest outcome.
 *
 * No asset data and no error detail reach this component — `reset()` re-renders the segment.
 */
export default function AssetsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-card px-6 py-16 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border text-muted-foreground">
        !
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Couldn&apos;t load assets</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something went wrong loading your equipment. Try again — if it keeps happening, refresh the
        page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
      >
        Retry
      </button>
    </div>
  );
}
