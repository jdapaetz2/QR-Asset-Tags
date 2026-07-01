"use client";

import { useState } from "react";
import Link from "next/link";

import { formatCents } from "@/lib/plans/presets";
import {
  COVERED_ASSET_DEFINITION,
  PLAN_CONTACT_COPY,
  SCANS_UNLIMITED_COPY,
  coverageLimitLabel,
  coveragePercent,
  coverageTone,
  type CoverageTone,
} from "@/lib/plans/usage";

export type PlanUsageData = {
  planName: string;
  status?: string | null;
  covered: number;
  limit: number | null;
  tagCreditCents?: number | null;
  storageLimitMb?: number | null;
  videoUploadsEnabled?: boolean | null;
};

const BAR_CLASSES: Record<CoverageTone, string> = {
  neutral: "bg-foreground/40",
  warning: "bg-amber-500",
  danger: "bg-destructive",
};

const TEXT_CLASSES: Record<CoverageTone, string> = {
  neutral: "text-muted-foreground",
  warning: "text-amber-700 dark:text-amber-500",
  danger: "text-destructive",
};

/** Covered / limit line + a calm progress meter (only when a numeric limit exists). */
function CoverageMeter({
  covered,
  limit,
}: {
  covered: number;
  limit: number | null;
}) {
  const tone = coverageTone(covered, limit);
  const pct = coveragePercent(covered, limit);

  if (limit === null) {
    return (
      <div className="text-sm">
        <span className="text-lg font-semibold tabular-nums">{covered}</span>{" "}
        <span className="text-muted-foreground">
          covered · Custom plan · no covered asset limit set
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          <span className="text-lg font-semibold tabular-nums">{covered}</span>
          <span className="text-muted-foreground"> / {coverageLimitLabel(limit)} covered</span>
        </span>
        <span className={`text-xs tabular-nums ${TEXT_CLASSES[tone]}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${BAR_CLASSES[tone]}`}
          style={{ width: `${Math.min(100, pct ?? 0)}%` }}
        />
      </div>
    </div>
  );
}

/** Full "Plan & usage" section for the settings page. */
function FullUsage({ data }: { data: PlanUsageData }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{data.planName}</h3>
        {data.status ? (
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            {data.status}
          </span>
        ) : null}
      </div>

      <CoverageMeter covered={data.covered} limit={data.limit} />

      <p className="text-sm text-muted-foreground">{SCANS_UNLIMITED_COPY}</p>
      <p className="text-sm text-muted-foreground">{COVERED_ASSET_DEFINITION}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {data.tagCreditCents != null ? (
          <>
            <dt>Tag credit</dt>
            <dd className="text-foreground">{formatCents(data.tagCreditCents)}</dd>
          </>
        ) : null}
        {data.storageLimitMb != null ? (
          <>
            <dt>Storage limit</dt>
            <dd className="text-foreground">{data.storageLimitMb} MB</dd>
          </>
        ) : null}
        {data.videoUploadsEnabled != null ? (
          <>
            <dt>Video uploads</dt>
            <dd className="text-foreground">
              {data.videoUploadsEnabled ? "Enabled" : "Disabled"}
            </dd>
          </>
        ) : null}
      </dl>

      <p className="text-xs text-muted-foreground">{PLAN_CONTACT_COPY}</p>
    </div>
  );
}

/** Compact click/tap disclosure for the dashboard + assets header. */
function CompactUsage({
  data,
  compactLabel,
}: {
  data: PlanUsageData;
  compactLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const tone = coverageTone(data.covered, data.limit);
  const label =
    compactLabel ??
    (data.limit === null
      ? "Plan & usage"
      : `Coverage: ${data.covered} / ${coverageLimitLabel(data.limit)}`);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground ${
          tone === "neutral" ? "text-muted-foreground" : TEXT_CLASSES[tone]
        }`}
      >
        <span
          aria-hidden
          className={`size-1.5 rounded-full ${BAR_CLASSES[tone]}`}
        />
        {label}
        <span aria-hidden className="text-muted-foreground">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 z-10 mt-2 w-72 max-w-[85vw] rounded-lg border bg-card p-3 text-sm shadow-md">
          <div className="mb-2 font-medium">Plan &amp; usage</div>
          <div className="mb-2">
            <span className="text-muted-foreground">Covered assets: </span>
            <span className="tabular-nums font-medium">
              {data.covered}
              {data.limit === null ? " · no limit" : ` / ${data.limit}`}
            </span>
          </div>
          <p className="mb-1 text-xs text-muted-foreground">
            {SCANS_UNLIMITED_COPY}
          </p>
          <p className="text-xs text-muted-foreground">
            {COVERED_ASSET_DEFINITION}
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-2 inline-flex text-xs underline-offset-4 hover:underline"
          >
            View plan &amp; usage →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Covered-asset usage display. `full` renders the settings section; `compact`
 * renders a small click/tap disclosure (mobile-safe — no hover) for the dashboard
 * and assets header. Presentation only: it receives already-computed data as props
 * and performs no I/O and no enforcement.
 */
export function PlanUsage({
  data,
  mode,
  compactLabel,
}: {
  data: PlanUsageData;
  mode: "compact" | "full";
  compactLabel?: string;
}) {
  return mode === "full" ? (
    <FullUsage data={data} />
  ) : (
    <CompactUsage data={data} compactLabel={compactLabel} />
  );
}
