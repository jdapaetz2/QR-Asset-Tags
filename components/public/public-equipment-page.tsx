import Link from "next/link";

import { safeBrandColor } from "@/lib/public/brand";
import { resolveSupportContact } from "@/lib/public/equipment";
import type { PublicDocument } from "@/lib/public/documents";
import { AckPrompt } from "@/components/public/ack-prompt";
import {
  PublicScannerView,
  PublicScannerStickyActions,
  type PublicAsset,
  type PublicPage,
  type PublicOrg,
} from "@/components/public/public-scanner-view";

// Re-export the public scanner types from their shared home so existing importers
// (lib/public/resolve.ts, app/t/[shortCode]/page.tsx) keep working unchanged.
export type { PublicAsset, PublicPage, PublicOrg };

/**
 * The real public scanner page (/t/[shortCode]). A thin wrapper around the shared
 * PublicScannerView in "public" mode (real links + sticky bar fixed to the viewport)
 * plus the once-per-rental acknowledgement prompt. Scan logging happens in the route.
 */
export function PublicEquipmentPage({
  shortCode,
  asset,
  assetId,
  activeRentalSessionId,
  page,
  org,
  documents,
  isStaffViewer = false,
}: {
  shortCode: string;
  asset: PublicAsset;
  assetId: string;
  activeRentalSessionId: string | null;
  page: PublicPage;
  org: PublicOrg;
  documents: PublicDocument[];
  /** True only for an authenticated member of this asset's org — shows the staff-workflow link. */
  isStaffViewer?: boolean;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-28 pt-6 sm:pb-6">
      {isStaffViewer ? (
        <Link
          href={`/staff/t/${shortCode}`}
          className="mb-4 flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-accent"
        >
          <span className="font-medium">Open staff workflow</span>
          <span aria-hidden className="text-muted-foreground">
            →
          </span>
        </Link>
      ) : null}

      <PublicScannerView
        mode="public"
        shortCode={shortCode}
        asset={asset}
        assetId={assetId}
        activeRentalSessionId={activeRentalSessionId}
        page={page}
        org={org}
        documents={documents}
      />

      {/* Cold-staff sign-in affordance (Wave 3N.3). A quiet, muted footer link for anyone who is not already an
          authorized same-org staff member — never tenant-colored, never competing with the renter CTAs. Renter
          features need no login; `sanitizeNextPath` + the staff guard keep the `next` safe and cross-org 404s. */}
      {!isStaffViewer ? (
        <div className="mt-6 flex justify-center print:hidden">
          <Link
            href={`/login?next=/staff/t/${shortCode}`}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Staff member? Sign in
          </Link>
        </div>
      ) : null}

      <PublicScannerStickyActions
        mode="public"
        shortCode={shortCode}
        documents={documents}
        org={org}
        supportPhone={resolveSupportContact(asset, org).phone}
      />

      <AckPrompt
        shortCode={shortCode}
        assetId={assetId}
        sessionId={activeRentalSessionId}
        brand={safeBrandColor(org?.primary_color)}
        viewerIsAuthorizedStaff={isStaffViewer}
      />
    </main>
  );
}
