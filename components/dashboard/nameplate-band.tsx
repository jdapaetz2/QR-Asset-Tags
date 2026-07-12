import { BandRule } from "@/components/ui/band-rule";
import { BandStat } from "@/components/ui/band-stat";
import { PlateLabel } from "@/components/ui/plate-label";
import { Sparkline } from "@/components/ui/sparkline";
import type { BandStatSpec } from "@/lib/dashboard/briefing";

/**
 * Nameplate band — the iron briefing header (docs/brand/dashboard-reference.html
 * states 1/3). PlateLabel + mono date, a greeting headline carrying the attention
 * count, and the four ranked BandStats closed by a single brass BandRule. The
 * all-clear variant (attentionCount === 0) shows the only chrome green in the app.
 */
export function NameplateBand({
  orgName,
  dateLabel,
  greeting,
  firstName,
  attentionCount,
  stats,
  sparkValues,
}: {
  orgName: string;
  dateLabel: string;
  greeting: string;
  firstName: string;
  attentionCount: number;
  stats: BandStatSpec[];
  sparkValues: number[];
}) {
  const allClear = attentionCount === 0;
  // The queue is one row per asset, so the headline unit is assets (not vague "things").
  const unit = attentionCount === 1 ? "asset needs" : "assets need";
  const hasScans = sparkValues.some((v) => v > 0);

  return (
    <div className="overflow-hidden rounded-xl bg-iron-950 text-bone-50">
      <div className="px-6 pt-4">
        <PlateLabel label={`${orgName} · Operations briefing`} meta={dateLabel} />

        {/* Dashboard copy uses a period, never an em dash. */}
        <h1 className="mt-2.5 flex items-center gap-2.5 text-[21px] font-semibold">
          {allClear ? (
            <>
              <span
                aria-hidden
                className="size-[9px] shrink-0 rounded-full bg-chrome-clear"
              />
              All clear, {firstName}.
            </>
          ) : (
            <>
              {greeting}, {firstName}. {attentionCount} {unit} your attention.
            </>
          )}
        </h1>

        <div className="mt-3.5 flex flex-wrap gap-2.5">
          {stats.map((s) => (
            <BandStat
              key={s.key}
              value={s.value}
              total={s.total}
              label={s.label}
              href={s.href}
              attention={s.attention}
            >
              {s.sparkline && hasScans ? (
                <Sparkline
                  values={sparkValues}
                  variant="iron"
                  label={`${s.value} scans over the last 7 days`}
                />
              ) : null}
            </BandStat>
          ))}
        </div>
      </div>

      <BandRule className="mt-3.5" />
    </div>
  );
}
