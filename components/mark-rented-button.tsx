"use client";

import { useRef } from "react";
import Link from "next/link";
import { useActionState } from "react";

import { startRentalSession, type RentalActionState } from "@/lib/rentals/actions";
import { RentalDetailsFields } from "@/components/rental-details-fields";
import { AssetCodeChip } from "@/components/ui/asset-code-chip";

const BTN =
  "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50";

/**
 * "Mark rented" for the asset list (Phase 3C.6). Opens an accessible dialog that captures the SAME optional
 * rental details as the outbound workflow (shared `RentalDetailsFields`) and, when the asset has unresolved
 * submissions, shows a responsive warning (text + link + actions each wrap cleanly — no horizontal overflow,
 * unlike the old cramped `w-56` popover). Reuses the unchanged `startRentalSession` action; the session isn't
 * started until the final "Mark rented" press.
 */
export function MarkRentedButton({
  assetId,
  assetName,
  assetCode,
  unresolvedCount,
  redirectTo,
}: {
  assetId: string;
  assetName?: string;
  assetCode?: string;
  unresolvedCount: number;
  redirectTo: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<RentalActionState, FormData>(
    startRentalSession.bind(null, assetId, redirectTo),
    {}
  );

  const submissionsHref = `/dashboard/submissions?asset_id=${encodeURIComponent(assetId)}`;

  return (
    <>
      <button type="button" className={BTN} onClick={() => dialogRef.current?.showModal()}>
        Mark rented
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="mark-rented-title"
        className="m-auto w-[min(92vw,28rem)] rounded-lg border bg-card p-5 text-foreground backdrop:bg-black/40"
      >
        <div className="flex min-w-0 flex-col gap-4 text-left">
          <div className="flex flex-col gap-1">
            <h2 id="mark-rented-title" className="text-lg font-semibold">
              Mark rented
            </h2>
            {assetCode ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <AssetCodeChip code={assetCode} />
                {assetName ? <span className="min-w-0 break-words font-medium">{assetName}</span> : null}
              </div>
            ) : null}
          </div>

          {unresolvedCount > 0 ? (
            <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-warning/40 bg-warning/5 p-3">
              <p className="break-words text-sm text-foreground">
                This asset has {unresolvedCount} unresolved submission
                {unresolvedCount === 1 ? "" : "s"}. Review before renting?
              </p>
              <Link
                href={submissionsHref}
                className="text-sm font-medium text-info underline-offset-4 hover:underline"
              >
                View submissions →
              </Link>
            </div>
          ) : null}

          <form action={formAction} className="flex min-w-0 flex-col gap-3">
            <RentalDetailsFields idPrefix={`mr-${assetId}`} />
            {state.error ? (
              <span role="alert" className="text-sm text-destructive">
                {state.error}
              </span>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                disabled={pending}
                className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-9 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {pending ? "Marking rented…" : unresolvedCount > 0 ? "Mark rented anyway" : "Mark rented"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
