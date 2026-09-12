import { NoScriptContinue } from "@/components/public/noscript-continue";

/**
 * Route-level loading skeleton for the public renter forms (Phase C8).
 *
 * WHY IT EXISTS, AND WHY ONLY HERE. `/forms/[shortCode]/*` had no loading file, and the damage form was
 * measured on staging at **1660 ms to interactive content** — 1.66 s of blank page for a renter standing
 * at a machine who has just tapped "Report damage" from a physical tag. That is the product's rank-1
 * surface by the brief's own impact ordering, and it was the only measured wait long enough to warrant
 * covering. Routes that were already fast did not get one: a skeleton on an instant route is a flash of
 * furniture, not reassurance.
 *
 * DIMENSIONS MATCH `PublicFormLayout` EXACTLY — same `max-w-md`, same `gap-6`, same `px-4 py-6`, and
 * field blocks at the real control heights — so the real form replaces this in place rather than
 * shoving the page around. Avoiding layout shift is the point; a skeleton that jumps is worse than none.
 *
 * NOTHING HERE IS FABRICATED. No organization name, no asset code, no counts, no statuses — only neutral
 * blocks. The renter learns "this is loading", never a value that might turn out to be different, and
 * nothing about an asset they may not be entitled to see is revealed while eligibility is still being
 * resolved server-side.
 *
 * Scan-surface rules apply: pure CSS, no client JS, no webfonts, no brass. `prefers-reduced-motion`
 * drops the pulse rather than animating at someone who asked it not to.
 */
export function PublicFormLoading() {
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Without JavaScript this skeleton is never replaced: send the browser to the non-streaming copy. */}
      <NoScriptContinue />

      {/* Screen readers get the state as words; the blocks below are decoration to them. */}
      <span className="sr-only">Loading the form…</span>

      <div aria-hidden className="flex flex-col gap-6">
        {/* Header: org line + title */}
        <div className="flex flex-col gap-2">
          <div className="h-3 w-28 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-7 w-48 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-4 w-40 rounded bg-muted motion-safe:animate-pulse" />
        </div>

        {/* Field blocks at real control heights: label (12px) + input (38px) */}
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-3 w-24 rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-[38px] w-full rounded-md border bg-muted/40" />
            </div>
          ))}
          {/* The multiline field the damage/support forms both carry */}
          <div className="flex flex-col gap-1">
            <div className="h-3 w-32 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-24 w-full rounded-md border bg-muted/40" />
          </div>
        </div>

        {/* Primary action */}
        <div className="h-10 w-full rounded-md bg-muted motion-safe:animate-pulse" />
      </div>
    </main>
  );
}
