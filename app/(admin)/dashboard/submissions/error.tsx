"use client";

/**
 * Error boundary for the submissions inbox (Prompt C, designed states). Keeps the operator on
 * the page with a clear retry (`reset()` re-renders the segment). No submission data is exposed.
 */
export default function SubmissionsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-card px-6 py-16 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border text-muted-foreground">
        !
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Couldn&apos;t load submissions</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something went wrong loading the inbox. Try again — if it keeps happening, refresh the page.
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
