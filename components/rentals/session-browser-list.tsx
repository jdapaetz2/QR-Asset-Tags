"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/relative-time";
import { buildSessionEvidenceHref } from "@/lib/rentals/evidence";
import { loadMoreRentalSessions } from "@/lib/rentals/session-browser-actions";
import type { BrowserSession, SessionFilters } from "@/lib/rentals/session-browser";

function SessionCard({ s }: { s: BrowserSession }) {
  const active = s.status === "active";
  const who = [s.renter_label, s.rental_reference].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded border border-brass-500/30 bg-bone-50 px-1.5 py-0.5 font-mono text-xs text-iron-950">
          {s.reference}
        </span>
        <Badge tone={active ? "info" : "neutral"}>{active ? "Active" : "Returned"}</Badge>
      </div>

      {s.asset ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <AssetTagChip code={s.asset.asset_code} />
          <span className="font-medium text-iron-950">{s.asset.asset_name}</span>
        </div>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
        {who ? (
          <>
            <dt>Renter</dt>
            <dd className="text-foreground">{who}</dd>
          </>
        ) : null}
        <dt>Started</dt>
        <dd className="text-foreground">
          <RelativeTime value={s.started_at} />
        </dd>
        {s.returned_at ? (
          <>
            <dt>Returned</dt>
            <dd className="text-foreground">
              <RelativeTime value={s.returned_at} />
            </dd>
          </>
        ) : null}
      </dl>

      <Link
        href={buildSessionEvidenceHref(s.id)}
        className="inline-flex min-h-9 w-fit items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
      >
        View session evidence →
      </Link>
    </li>
  );
}

/**
 * Renders the first server-loaded page of rental sessions + an explicit "Load 50 more" control (Phase 3C.8,
 * Part J). One click = one server request; appends beneath; strictly manual (no observer/timer/refresh loop).
 * A failed load keeps prior rows and offers an inline retry.
 */
export function SessionBrowserList({
  initialSessions,
  initialCursor,
  initialHasMore,
  filters,
}: {
  initialSessions: BrowserSession[];
  initialCursor: string | null;
  initialHasMore: boolean;
  filters: SessionFilters;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (pending || !hasMore) return;
    setError(false);
    startTransition(async () => {
      try {
        const res = await loadMoreRentalSessions(cursor, filters);
        setSessions((prev) => [...prev, ...res.sessions]);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {sessions.map((s) => (
          <SessionCard key={s.id} s={s} />
        ))}
      </ul>

      {hasMore ? (
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
      ) : sessions.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">End of recorded history</p>
      ) : null}
    </div>
  );
}
