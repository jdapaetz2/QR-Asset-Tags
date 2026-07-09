"use client";

import { useState } from "react";
import Link from "next/link";
import { useActionState } from "react";

import { startRentalSession, type RentalActionState } from "@/lib/rentals/actions";

const BTN =
  "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50";

/**
 * "Mark rented" for the asset list, with a pre-rent warning (Prompt C, task 5). When the asset has
 * unresolved submissions (new/reviewed), the first click opens an inline confirm listing the count
 * with a link to that asset's submissions — proceed or cancel. With no unresolved submissions it
 * submits directly. Reuses the unchanged `startRentalSession` action (no rental-model change); this
 * is purely a client-side gate. Never auto-blocks.
 */
export function MarkRentedButton({
  assetId,
  unresolvedCount,
  redirectTo,
}: {
  assetId: string;
  unresolvedCount: number;
  redirectTo: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<RentalActionState, FormData>(
    startRentalSession.bind(null, assetId, redirectTo),
    {}
  );

  const submissionsHref = `/dashboard/submissions?asset_id=${encodeURIComponent(assetId)}`;

  // No unresolved submissions → a plain submit, no warning.
  if (unresolvedCount === 0) {
    return (
      <form action={formAction} className="inline-flex flex-col items-end gap-1">
        <button type="submit" disabled={pending} className={BTN}>
          {pending ? "…" : "Mark rented"}
        </button>
        {state.error ? (
          <span role="alert" className="text-xs text-destructive">
            {state.error}
          </span>
        ) : null}
      </form>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className={BTN} onClick={() => setConfirming(true)}>
        Mark rented
      </button>
    );
  }

  return (
    <div className="flex w-56 flex-col items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-left">
      <p className="text-xs text-foreground">
        This asset has {unresolvedCount} unresolved submission
        {unresolvedCount === 1 ? "" : "s"}. Review before renting?
      </p>
      <Link
        href={submissionsHref}
        className="text-xs font-medium text-info underline-offset-4 hover:underline"
      >
        View submissions →
      </Link>
      <div className="flex items-center gap-2">
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-8 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {pending ? "…" : "Mark rented anyway"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="inline-flex h-8 items-center rounded-md border px-2.5 text-xs hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {state.error ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
