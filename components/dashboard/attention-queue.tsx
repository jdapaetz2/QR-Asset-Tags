"use client";

import Link from "next/link";
import { useState } from "react";

import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { PrimaryButton } from "@/components/ui/primary-button";
import { RelativeTime } from "@/components/relative-time";
import { cn } from "@/lib/utils";
import { nextOpenAccordionId } from "@/lib/dashboard/briefing";

export type QueueItem = {
  key: string;
  assetId: string;
  code: string;
  /** Substantive one-line summary shown on the collapsed row + as the amber chip. */
  title: string;
  reason: string;
  /** Primary destination: "Open in submissions" (submission items) or the fix page (setup gaps). */
  href: string;
  historyHref: string;
  /** Setup gaps get an iron dot + "Finish setup"; submission items get an amber dot. */
  isSetup: boolean;
  detail: {
    description: string | null;
    submitter: string | null;
    reference: string | null;
    createdAt: string | null;
    thumbUrl: string | null;
  } | null;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn(
        "size-3.5 shrink-0 text-iron-600 transition-transform motion-reduce:transition-none",
        open && "rotate-180"
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Needs-attention queue — a single-open accordion (docs/brand/ui-language.md).
 * Opening a row collapses any other; the top row is pre-expanded when the queue is
 * non-empty. The expanded card carries the photo/description/submitter for
 * submission items, and exactly one chamfered PrimaryButton (the sole full-detail
 * path). Expansion is 250ms ease-out; reduced-motion renders instantly.
 */
export function AttentionQueue({ items }: { items: QueueItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.key ?? null);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {items.map((item) => {
        const open = openId === item.key;
        const primaryLabel = item.isSetup ? "Finish setup" : "Open in submissions";
        return (
          <div key={item.key} className="border-b border-iron-200 last:border-b-0">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId((cur) => nextOpenAccordionId(cur, item.key))}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent/40"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  item.isSetup ? "bg-iron-600" : "bg-warning"
                )}
              />
              <AssetTagChip code={item.code} />
              <span className="flex-1 text-[13.5px] text-iron-600">{item.title}</span>
              <Chevron open={open} />
            </button>

            {/* Grid-rows height animation — CSS only, so reduced-motion is instant. */}
            <div
              className={cn(
                "grid transition-all duration-[250ms] ease-out motion-reduce:transition-none",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <div className="border-t border-iron-200 bg-bone-50 px-4 py-3.5">
                  <span className="inline-flex rounded-md bg-amber-chip-bg px-2 py-0.5 text-xs text-amber-chip-text">
                    {item.title}
                  </span>

                  {item.detail ? (
                    <div className="mt-2.5 flex flex-col gap-2">
                      <div className="flex gap-3">
                        {item.detail.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.detail.thumbUrl}
                            alt=""
                            className="size-14 shrink-0 rounded-md border border-iron-200 object-cover"
                          />
                        ) : null}
                        {item.detail.description ? (
                          <p className="text-[13.5px] leading-snug text-foreground">
                            “{item.detail.description}”
                          </p>
                        ) : null}
                      </div>
                      {item.detail.submitter || item.detail.reference ? (
                        <p className="text-xs text-iron-600">
                          {item.detail.submitter}
                          {item.detail.createdAt ? (
                            <>
                              {item.detail.submitter ? " · " : ""}
                              <RelativeTime value={item.detail.createdAt} />
                            </>
                          ) : null}
                          {item.detail.reference ? (
                            <>
                              {" · "}
                              <span className="font-mono">{item.detail.reference}</span>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2.5 text-[13.5px] text-iron-600">{item.reason}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <PrimaryButton href={item.href}>{primaryLabel}</PrimaryButton>
                    <Link
                      href={item.historyHref}
                      className="inline-flex h-[30px] items-center rounded-[7px] border border-iron-200 px-3 text-[13px] transition-colors hover:bg-accent"
                    >
                      Asset history
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
