import Link from "next/link";

import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { submissionsHref } from "@/lib/analytics/insights";
import type { ProblemAsset } from "@/lib/analytics/problem-assets";

/**
 * Problem-assets module (docs/brand/analytics-reference.html frame 3): one
 * consolidated ranked list replacing the old "most X" lists. Each row: AssetTagChip,
 * an amber open-count chip (only when open > 0), a reason summary, scans in mono, and
 * a Review link to the asset's unresolved submissions.
 */
export function ProblemAssets({ rows }: { rows: ProblemAsset[] }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-iron-200 px-4 py-3 last:border-b-0"
        >
          <AssetTagChip code={r.code} />
          {r.open > 0 ? (
            <span className="rounded-md bg-amber-chip-bg px-2 py-0.5 text-xs text-amber-chip-text">
              {r.open} open
            </span>
          ) : null}
          <span className="min-w-0 flex-1 text-[13px] text-iron-600">{r.reason}</span>
          <span className="font-mono text-xs text-iron-600">{r.scans} scans</span>
          <Link
            href={submissionsHref({
              assetId: r.id,
              status: r.open > 0 ? "unresolved" : undefined,
            })}
            className="text-[13px] font-medium text-brass-600 hover:underline"
          >
            Review →
          </Link>
        </div>
      ))}
    </div>
  );
}
