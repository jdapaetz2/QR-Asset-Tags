"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { RelativeTime } from "@/components/relative-time";

/**
 * Confirmation gate for attaching an outbound baseline to an EXISTING active rental session (Phase 3C.6). The
 * staff member must explicitly acknowledge that they're using the existing session — this does NOT start a new
 * session or change the rental start time — before the inspection form is revealed. Cancel returns to the asset.
 */
export function OutboundSessionGate({
  startedAt,
  renterLabel,
  rentalReference,
  cancelHref,
  children,
}: {
  startedAt: string;
  renterLabel: string | null;
  rentalReference: string | null;
  cancelHref: string;
  children: ReactNode;
}) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) return <>{children}</>;

  return (
    <section
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
    >
      <p className="font-medium text-amber-700 dark:text-amber-400">
        This asset already has an active rental session.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
        <dt>Started</dt>
        <dd className="text-foreground">
          <RelativeTime value={startedAt} />
        </dd>
        <dt>Renter / customer</dt>
        <dd className="text-foreground">{renterLabel || "Not provided"}</dd>
        <dt>Rental reference</dt>
        <dd className="text-foreground">{rentalReference || "Not provided"}</dd>
      </dl>
      <p className="text-muted-foreground">
        This outbound inspection will be attached to the existing rental session. It will not start a new session
        or change the rental start time.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Continue with this rental session
        </button>
        <Link
          href={cancelHref}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </Link>
      </div>
    </section>
  );
}
