"use client";

import { useState } from "react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { RelativeTime } from "@/components/relative-time";
import { RentalDetailsFields } from "@/components/rental-details-fields";
import {
  startRentalSession,
  closeRentalSession,
  type RentalActionState,
} from "@/lib/rentals/actions";

export type ActiveRentalSession = {
  id: string;
  rental_reference: string | null;
  renter_label: string | null;
  started_at: string;
};

/**
 * Admin-only rental status control. Shows the active session (with Mark returned /
 * Cancel) or a "Mark as rented" form. When the asset has unresolved submissions, the
 * start submit is gated behind a pre-rent warning (Prompt C) — the rental action itself
 * is unchanged. Never rendered on public surfaces.
 */
export function RentalStatusForm({
  assetId,
  session,
  unresolvedCount = 0,
}: {
  assetId: string;
  session: ActiveRentalSession | null;
  unresolvedCount?: number;
}) {
  const detailHref = `/dashboard/assets/${assetId}`;
  const submissionsHref = `/dashboard/submissions?asset_id=${encodeURIComponent(assetId)}`;
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<RentalActionState, FormData>(
    startRentalSession.bind(null, assetId, detailHref),
    {}
  );

  if (session) {
    const detail = [session.renter_label, session.rental_reference]
      .filter(Boolean)
      .join(" · ");
    return (
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-sm">
            <h2 className="font-medium">
              Rental status{" "}
              <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-500">
                Rented
              </span>
            </h2>
            <p className="mt-1 text-muted-foreground">
              {detail ? `${detail} · ` : ""}since{" "}
              <RelativeTime value={session.started_at} />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              action={closeRentalSession.bind(null, assetId, session.id, "returned", detailHref)}
              variant="outline"
            >
              Mark returned
            </ActionButton>
            <ActionButton
              action={closeRentalSession.bind(null, assetId, session.id, "cancelled", detailHref)}
              variant="outline"
              confirm="Cancel this rental session? Use this only for mistaken starts."
            >
              Cancel rental
            </ActionButton>
          </div>
        </div>
      </section>
    );
  }

  const warn = unresolvedCount > 0;

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium">Rental status</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Not currently rented. Marking it rented shows a one-time acknowledgement
        prompt to renters who scan the QR tag.
      </p>
      <form action={formAction} className="mt-3 flex flex-col gap-3">
        {state.error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Shared rental-details definition (Phase 3C.6) — identical names/semantics to outbound + mark rented. */}
          <RentalDetailsFields idPrefix={`start-${assetId}`} />
        </div>

        {warn && confirming ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="text-sm text-foreground">
              This asset has {unresolvedCount} unresolved submission
              {unresolvedCount === 1 ? "" : "s"}. Review before renting?
            </p>
            <Link
              href={submissionsHref}
              className="text-sm font-medium text-info underline-offset-4 hover:underline"
            >
              View submissions →
            </Link>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Starting…" : "Mark rented anyway"}
              </Button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : warn ? (
          <Button
            type="button"
            onClick={() => setConfirming(true)}
            className="self-start"
          >
            Mark as rented
          </Button>
        ) : (
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Starting…" : "Mark as rented"}
          </Button>
        )}
      </form>
    </section>
  );
}
