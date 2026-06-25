"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import {
  startRentalSession,
  closeRentalSession,
  type RentalActionState,
} from "@/lib/rentals/actions";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export type ActiveRentalSession = {
  id: string;
  rental_reference: string | null;
  renter_label: string | null;
  started_at: string;
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

/**
 * Admin-only rental status control. Shows the active session (with Mark returned /
 * Cancel) or a small "Mark as rented" form. Never rendered on public surfaces.
 */
export function RentalStatusForm({
  assetId,
  session,
}: {
  assetId: string;
  session: ActiveRentalSession | null;
}) {
  const [state, formAction, pending] = useActionState<
    RentalActionState,
    FormData
  >(startRentalSession.bind(null, assetId), {});

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
              {detail ? `${detail} · ` : ""}since {formatDate(session.started_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              action={closeRentalSession.bind(
                null,
                assetId,
                session.id,
                "returned"
              )}
              variant="outline"
            >
              Mark returned
            </ActionButton>
            <ActionButton
              action={closeRentalSession.bind(
                null,
                assetId,
                session.id,
                "cancelled"
              )}
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Rental reference (optional)</span>
            <input name="rental_reference" className={inputClass} placeholder="e.g. RA-1042" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Renter label (optional)</span>
            <input name="renter_label" className={inputClass} placeholder="e.g. Acme Crew B" />
          </label>
        </div>
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Starting…" : "Mark as rented"}
        </Button>
      </form>
    </section>
  );
}
