import { BrandWordmark } from "@/components/brand/brand";
import { PLATFORM_NAME } from "@/lib/constants";

/**
 * Print-only masthead for the rental-session evidence record (Phase 3C.7). Hidden on screen
 * (`hidden print:block`); revealed only when the page is printed. Carries the canonical Mulemark
 * wordmark ARTWORK (never re-set from live text — see docs/brand/BRAND.md), the document title, and
 * the asset + session identity so a printed/exported PDF is self-identifying. The route also sets a
 * Mulemark <title>, so the browser's own print header reads the platform brand, not the raw route path.
 */
export function EvidencePrintHeader({
  assetCode,
  assetName,
  sessionRef,
  status,
}: {
  assetCode: string | null;
  assetName: string | null;
  sessionRef: string;
  status: string;
}) {
  return (
    <header className="hidden print:block" data-evidence-print-header>
      <div className="flex items-center justify-between gap-4 border-b border-iron-200 pb-3">
        <BrandWordmark className="h-5 w-auto" title={PLATFORM_NAME} />
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-iron-600">
          Rental session evidence
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
        <div className="flex flex-col">
          {assetName ? <span className="font-semibold text-iron-950">{assetName}</span> : null}
          {assetCode ? <span className="font-mono text-xs text-iron-600">{assetCode}</span> : null}
        </div>
        <div className="flex flex-col text-right">
          <span className="font-mono text-xs text-iron-950">{sessionRef}</span>
          <span className="text-xs text-iron-600">{status}</span>
        </div>
      </div>
    </header>
  );
}
