import { PlateLabel } from "@/components/ui/plate-label";
import { BandRule } from "@/components/ui/band-rule";
import { RelativeTime } from "@/components/relative-time";

/**
 * Analytics nameplate band (docs/brand/analytics-reference.html frame 1). PlateLabel
 * "[org] · Fleet analytics" + the mono active-range stamp; a derived insight headline
 * (period scan + new-submission totals), never the word "Analytics"; and a subline
 * naming the top asset by scans with a relative "Updated" time (never raw UTC). Closed
 * by the shared brass BandRule.
 */
export function AnalyticsBand({
  orgName,
  stamp,
  headline,
  topAssetName,
  updatedAt,
}: {
  orgName: string;
  stamp: string;
  headline: string;
  topAssetName: string | null;
  updatedAt: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-iron-950 text-bone-50">
      <div className="px-6 pt-4">
        <PlateLabel label={`${orgName} · Fleet analytics`} meta={stamp} />
        <h1 className="mt-2.5 text-[21px] font-semibold">{headline}</h1>
        <p className="mt-1 text-[13px] text-band-label">
          {topAssetName ? `${topAssetName} drove most of the traffic. ` : ""}
          Updated <RelativeTime value={updatedAt} className="text-band-label" />.
        </p>
      </div>
      <BandRule className="mt-3.5" />
    </div>
  );
}
