"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { RelativeTime } from "@/components/relative-time";
import { SubmissionBadges } from "@/components/submissions/submission-badges";
import { loadMoreAssetTimeline } from "@/lib/timeline/actions";
import { historyEndState } from "@/lib/history/end-state";
import type { TimelineEvent, TimelineKind } from "@/lib/timeline/timeline";
import type { TimelineFilters } from "@/lib/timeline/cursor";

const KIND_LABELS: Record<TimelineKind, string> = {
  created: "Created",
  submission: "Submission",
  acknowledgement: "Acknowledgement",
  tag_request: "Tag request",
  rental_started: "Rental",
  rental_ended: "Rental",
  archived: "Archived",
};

function TimelineEventCard({ e }: { e: TimelineEvent }) {
  const isRental = e.kind === "rental_started" || e.kind === "rental_ended";
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {e.kind === "submission" && e.formType ? (
          <SubmissionBadges
            formType={e.formType}
            origin={e.origin ?? null}
            status={e.status ?? ""}
            damage={e.damage}
            missing={e.missing}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              {KIND_LABELS[e.kind]}
            </span>
            <span className="text-sm font-medium">{e.title}</span>
            {e.badge ? (
              <span className="rounded-full border px-2 py-0.5 text-xs">{e.badge}</span>
            ) : null}
          </div>
        )}
        <span className="text-xs text-muted-foreground">
          <RelativeTime value={e.at} />
        </span>
      </div>

      {/* Rental rows (Phase 3C.8, Part I): the RNT reference is visible (non-clickable), with a separate
          explicit action to the canonical session evidence view. */}
      {isRental ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {e.sessionRef ? (
            <span className="rounded border border-brass-500/30 bg-bone-50 px-1.5 py-0.5 font-mono text-xs text-iron-950">
              {e.sessionRef}
            </span>
          ) : null}
          {e.detail ? <span>{e.detail}</span> : null}
          {e.sessionEvidenceHref ? (
            <Link
              href={e.sessionEvidenceHref}
              className="text-foreground underline-offset-4 hover:underline"
            >
              View session evidence
            </Link>
          ) : null}
        </div>
      ) : e.reference || e.detail || e.contact || e.attachmentCount || e.href ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {e.reference ? (
            <span className="font-mono text-xs text-muted-foreground/80">{e.reference}</span>
          ) : null}
          {e.detail ? <span>{e.detail}</span> : null}
          {e.contact ? <span>{e.contact}</span> : null}
          {e.attachmentCount ? (
            <span>
              📎 {e.attachmentCount} attachment{e.attachmentCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {e.href ? (
            <Link href={e.href} className="text-foreground underline-offset-4 hover:underline">
              Open details
            </Link>
          ) : null}
        </div>
      ) : null}

      {e.statement ? (
        <p className="mt-2 border-l-2 pl-3 text-sm italic text-muted-foreground">“{e.statement}”</p>
      ) : null}
    </li>
  );
}

/**
 * Renders the first server-loaded page of timeline events and an explicit "Load 50 more" control (Phase 3C.8,
 * Part F). One click = one server request; appends beneath (scroll preserved); strictly manual — no observer,
 * timer, or route refresh loop. A failed load keeps the events already shown and offers an inline retry.
 */
export function TimelineList({
  assetId,
  initialEvents,
  initialCursor,
  initialHasMore,
  filters,
  clearHref,
}: {
  assetId: string;
  initialEvents: TimelineEvent[];
  initialCursor: string | null;
  initialHasMore: boolean;
  filters: TimelineFilters;
  /** Where "Clear filters" navigates (the unfiltered first page for this asset). */
  clearHref: string;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (pending || !hasMore) return; // guard double-clicks / end
    setError(false);
    startTransition(async () => {
      try {
        const res = await loadMoreAssetTimeline(assetId, cursor, filters);
        setEvents((prev) => [...prev, ...res.events]);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch {
        setError(true); // keep existing events; offer retry
      }
    });
  }

  // Filter-aware end state (Phase 3C.8.1): "End of recorded history" must appear only for an unfiltered, all-time
  // timeline — never when a filter simply exhausted its matches (older history exists outside the filter).
  const state = historyEndState({
    hasMore,
    hasActiveFilters: filters.active,
    itemCount: events.length,
  });
  const clearLink = (
    <Link href={clearHref} className="text-foreground underline-offset-4 hover:underline">
      Clear filters to view all history
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      {events.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {events.map((e) => (
            <TimelineEventCard key={e.key} e={e} />
          ))}
        </ol>
      ) : null}

      {state === "load-more" ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            {pending ? "Loading more history…" : "Load 50 more"}
          </button>
          {pending ? (
            <span role="status" className="sr-only">
              Loading more history…
            </span>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              History could not be loaded. Try again.
            </p>
          ) : null}
        </div>
      ) : state === "end-all" ? (
        <p className="text-center text-xs text-muted-foreground">End of recorded history</p>
      ) : state === "end-filtered" ? (
        <p className="text-center text-xs text-muted-foreground">
          No more activity matches these filters. {clearLink}
        </p>
      ) : state === "empty-filtered" ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No history matches these filters. {clearLink}
        </p>
      ) : (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No recorded activity for this asset yet.
        </p>
      )}
    </div>
  );
}
