import { safeBrandColor } from "@/lib/public/brand";
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
}: {
  shortCode: string;
  asset: PublicAsset;
  assetId: string;
  activeRentalSessionId: string | null;
  page: PublicPage;
  org: PublicOrg;
  documents: PublicDocument[];
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-28 pt-6 sm:pb-6">
      <PublicScannerView
        mode="public"
        shortCode={shortCode}
        asset={asset}
        page={page}
        org={org}
        documents={documents}
      />

      <PublicScannerStickyActions
        mode="public"
        shortCode={shortCode}
        documents={documents}
        org={org}
      />

      <AckPrompt
        shortCode={shortCode}
        assetId={assetId}
        sessionId={activeRentalSessionId}
        brand={safeBrandColor(org?.primary_color)}
      />
    </main>
  );
}
