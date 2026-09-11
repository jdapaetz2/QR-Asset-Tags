"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

/**
 * Last-resort boundary for the staff asset workflows (outbound, return). The checklists catch their own action
 * failures and keep what was entered (lib/forms/action-recovery.ts); this only shows when something else throws.
 * No error detail is rendered.
 */
export default function StaffAssetError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ shortCode?: string }>();
  const back = params?.shortCode ? `/staff/t/${encodeURIComponent(params.shortCode)}` : "/dashboard";

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-card px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This step couldn&apos;t be shown. Try again, or go back to the asset.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Try again
        </button>
        <Link
          href={back}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Back to asset
        </Link>
      </div>
    </div>
  );
}
