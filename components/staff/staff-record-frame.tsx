import Link from "next/link";
import type { ReactNode } from "react";

import { PrintEvidenceButton } from "@/components/print-evidence-button";

/**
 * Mobile staff chrome for a shared record (Wave 3N.3). Wraps `<SessionEvidenceRecord>` / `<SubmissionDetailRecord>`
 * in the system-font staff shell (no admin AppShell, no admin webfonts) and gives the operator an explicit,
 * above-the-fold way back to the scanned asset — never relying on browser Back. Secondary links stay quiet.
 */
export function StaffRecordFrame({
  shortCode,
  assetId,
  assetName,
  eyebrow,
  showPrint = false,
  children,
}: {
  shortCode: string;
  assetId: string;
  assetName: string;
  /** Small context label above the Back action (e.g. "Session evidence"). */
  eyebrow: string;
  /** Evidence records offer a print action; submission records do not. */
  showPrint?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      {/* Prominent, above-the-fold exit back to the scanned asset. */}
      <div className="flex flex-col gap-2 print:hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {eyebrow}
          </span>
          {showPrint ? <PrintEvidenceButton label="Print" /> : null}
        </div>
        <Link
          href={`/staff/t/${shortCode}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          ← Back to {assetName}
        </Link>
      </div>

      {/* The shared record — identical content to the admin dashboard surface. */}
      <div className="flex flex-col gap-6">{children}</div>

      {/* Quiet secondary destinations. */}
      <nav
        aria-label="Asset navigation"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground print:hidden"
      >
        <Link
          href={`/dashboard/assets/${assetId}`}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          View asset
        </Link>
        <Link
          href={`/dashboard/assets/${assetId}/timeline`}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          View timeline
        </Link>
        <Link
          href={`/t/${shortCode}`}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Public equipment page
        </Link>
      </nav>
    </main>
  );
}
