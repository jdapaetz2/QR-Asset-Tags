"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

/**
 * Last-resort boundary for the public forms (damage, support, return). The forms catch their own action failures and
 * keep what the renter entered (lib/forms/action-recovery.ts); this only shows when something else throws, so the
 * renter sees a plain way back instead of the framework's full-page error. No error detail is rendered.
 */
export default function PublicFormError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ shortCode?: string }>();
  const back = params?.shortCode ? `/t/${encodeURIComponent(params.shortCode)}` : null;

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        This form couldn&apos;t be shown. Try again, or go back to the equipment page.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Try again
        </button>
        {back ? (
          <Link
            href={back}
            className="inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Back to equipment page
          </Link>
        ) : null}
      </div>
    </main>
  );
}
