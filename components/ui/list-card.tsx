import type { ReactNode } from "react";

/**
 * Mobile list card — the sub-`md` presentation of an operational table row (Phase B2).
 *
 * WHY THIS EXISTS. A wide `<table>` forces its min-content width into the *document's* intrinsic
 * width even when an ancestor `overflow-x-auto` clips it. Chromium then shrink-to-fits on mobile:
 * `window.innerWidth` expands to the content width and the whole page renders zoomed out (~66% on the
 * submissions inbox). Wrapping the table in a scroller does not cure it — that wrapper was already
 * present when D-1 was filed. Removing the table from layout below `md` does, and it is also the
 * layout users actually want: identity and status first, primary action reachable without dragging
 * sideways.
 *
 * USAGE. Render the existing table inside `hidden md:block` and a `<ul className="md:hidden">` of
 * these cards, both mapping the SAME already-fetched rows. No second query, no duplicated business
 * logic, no change to the desktop table's density.
 *
 * This is deliberately a dumb shell — slots, not a column-config engine. Each route supplies its own
 * fields, because the six affected tables genuinely differ.
 */
export function ListCard({
  title,
  meta,
  status,
  actions,
  children,
}: {
  /** Primary identity — the thing the user scans for (asset code chip, org name, reference). */
  title: ReactNode;
  /** Secondary identity line, e.g. name or slug. Wraps; never truncated silently. */
  meta?: ReactNode;
  /** Status badges / indicators. Kept adjacent to identity so state is legible at a glance. */
  status?: ReactNode;
  /**
   * Primary + secondary actions. Rendered in a wrapping row with ≥44px touch targets, always in the
   * card body — never behind a horizontal scroll.
   */
  actions?: ReactNode;
  /** Progressive disclosure for lower-priority metadata. */
  children?: ReactNode;
}) {
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-2">
        {/* `min-w-0` matters: without it these flex children refuse to shrink and long codes or
            references push the card wider than the viewport. */}
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="min-w-0 font-medium">{title}</div>
            {meta ? <div className="min-w-0 text-sm text-muted-foreground">{meta}</div> : null}
          </div>
          {status ? <div className="flex shrink-0 flex-col items-end gap-1.5">{status}</div> : null}
        </div>

        {children ? <div className="min-w-0 text-sm text-muted-foreground">{children}</div> : null}

        {actions ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5 [&_a]:min-h-11 [&_a]:inline-flex [&_a]:items-center [&_button]:min-h-11">
            {actions}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The `<ul>` wrapper for a card list. Hidden at the breakpoint where the table takes over.
 *
 * `at` must pair with the table's own `hidden <bp>:block`. Default `md`; use `lg` for a table that
 * still does not fit at 768px (the owner tag-request queue overflowed 6px there). Classes are
 * written out in full because Tailwind cannot see interpolated names.
 */
export function ListCardGroup({
  children,
  at = "md",
}: {
  children: ReactNode;
  at?: "md" | "lg";
}) {
  const hide = at === "lg" ? "lg:hidden" : "md:hidden";
  return <ul className={`flex flex-col gap-2 ${hide}`}>{children}</ul>;
}

/**
 * A definition-style metadata row for inside a card. Label left, value right, both allowed to wrap.
 * Use for the columns that do not earn a place in the card header.
 */
export function ListCardMeta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 py-0.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-foreground">{value}</span>
    </div>
  );
}
