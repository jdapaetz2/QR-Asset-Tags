import Link from "next/link";

import { RelativeTime } from "@/components/relative-time";
import { submissionTypeLabel } from "@/lib/submissions/origin";
import { openDamageHref, type OpenDamageSummary } from "@/lib/submissions/damage";

/**
 * Above-the-fold open-damage alert for the asset detail page (Phase 3C). Prominent danger card shown ONLY
 * when the asset has open damage — count + latest item (type · severity · relative time) + two actions.
 * No private media embedded. Renders nothing (self-clears) once all related damage is resolved.
 */
export function OpenDamageAlert({
  assetId,
  summary,
}: {
  assetId: string;
  summary: OpenDamageSummary;
}) {
  const { count, latest } = summary;
  const type = submissionTypeLabel(latest.formType, latest.origin);
  return (
    <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-destructive">
            <span aria-hidden>⚠</span>
            {count} open damage item{count === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest: <span className="font-medium text-foreground">{type}</span>
            {latest.severity ? ` · ${latest.severity} damage` : ""} ·{" "}
            <RelativeTime value={latest.createdAt} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={openDamageHref(assetId)}
            className="inline-flex min-h-9 items-center rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            Review damage
          </Link>
          <Link
            href={`/dashboard/assets/${assetId}/timeline`}
            className="inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            View asset history
          </Link>
        </div>
      </div>
    </section>
  );
}
