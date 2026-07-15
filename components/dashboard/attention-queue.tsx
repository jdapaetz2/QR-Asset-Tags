"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { AssetCodeChip } from "@/components/ui/asset-code-chip";
import { Badge } from "@/components/ui/badge";
import { PrimaryButton } from "@/components/ui/primary-button";
import { RelativeTime } from "@/components/relative-time";
import { MarkReturnedResolveButton } from "@/components/mark-returned-resolve-button";
import { cn } from "@/lib/utils";
import { withReturnTo } from "@/lib/nav/return-to";
import { nextOpenAccordionId } from "@/lib/dashboard/briefing";
import { submissionStatusTone } from "@/lib/ui/status";
import { submissionStatusLabel } from "@/lib/ui/status-labels";
import {
  setSubmissionStatus,
  type SubmissionActionState,
} from "@/lib/submissions/actions";

/** One unresolved submission on an attention asset — every one is enumerated (none hidden). */
export type QueueSubmission = {
  submissionId: string;
  formTypeLabel: string;
  status: string;
  /** `new` → "Mark reviewed" is offered. */
  canReview: boolean;
  /** Unresolved return checklist → "Mark returned & resolve" is offered (return rows only). */
  canReturn: boolean;
  description: string | null;
  submitter: string | null;
  reference: string | null;
  createdAt: string | null;
};

export type QueueItem = {
  key: string;
  assetId: string;
  code: string;
  /** The asset's top (most severe) issue, shown on the collapsed row + as the amber chip. */
  title: string;
  reason: string;
  /** Asset-level "Open in submissions" (the filtered inbox for this asset). */
  href: string;
  historyHref: string;
  /** A representative photo for the asset (the latest submission's first image), if any. */
  thumbUrl: string | null;
  /** Total unresolved submissions on the asset (= submissions.length). */
  count: number;
  /** Every unresolved submission for this asset, newest-first — all individually actionable. */
  submissions: QueueSubmission[];
};

const SECONDARY_BTN =
  "inline-flex h-[30px] items-center rounded-[7px] border border-iron-200 px-3 text-[13px] transition-colors hover:bg-accent disabled:opacity-50";

/**
 * Secondary "Mark reviewed" quick action. Reuses the existing setSubmissionStatus
 * server action (no new infrastructure, no toast/optimistic): submit sets the
 * submission to `reviewed` and revalidates by redirecting back to /dashboard.
 */
function MarkReviewedButton({ submissionId }: { submissionId: string }) {
  const action = setSubmissionStatus.bind(null, submissionId);
  const [state, formAction, pending] = useActionState<
    SubmissionActionState,
    FormData
  >(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="status" value="reviewed" />
      <input type="hidden" name="redirect_to" value="/dashboard" />
      <button type="submit" disabled={pending} className={SECONDARY_BTN}>
        {pending ? "Saving…" : "Mark reviewed"}
      </button>
      {state.error ? (
        <span role="alert" className="ml-2 text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

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

/** One enumerated submission row inside an expanded asset — carries its own quick actions. */
function SubmissionRow({ s, returnTo }: { s: QueueSubmission; returnTo: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-iron-200 bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">{s.formTypeLabel}</span>
        <Badge tone={submissionStatusTone(s.status)}>
          {submissionStatusLabel(s.status)}
        </Badge>
        {s.reference ? (
          <span className="font-mono text-[11px] text-iron-600">{s.reference}</span>
        ) : null}
        {s.createdAt ? (
          <span className="ml-auto text-xs text-iron-600">
            <RelativeTime value={s.createdAt} />
          </span>
        ) : null}
      </div>
      {s.description ? (
        <p className="text-[13px] leading-snug text-foreground">“{s.description}”</p>
      ) : null}
      {s.submitter ? <p className="text-xs text-iron-600">{s.submitter}</p> : null}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Link
          href={withReturnTo(`/dashboard/submissions/${s.submissionId}`, returnTo)}
          className={SECONDARY_BTN}
        >
          Open
        </Link>
        {s.canReview ? <MarkReviewedButton submissionId={s.submissionId} /> : null}
        {s.canReturn ? (
          <MarkReturnedResolveButton
            submissionId={s.submissionId}
            redirectTo="/dashboard"
            dense
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Needs-attention queue — a single-open accordion (docs/brand/ui-language.md). One row per asset;
 * opening a row collapses any other; the top row is pre-expanded. **Every** unresolved submission on
 * the asset is enumerated in the expanded card, each with its own quick actions (Open / Mark reviewed
 * / Mark returned & resolve) — nothing is capped or hidden. All rows render (the queue is the primary
 * work list, so the page grows vertically rather than scroll-boxing); a "Collapse all" control appears
 * once the list is long. Expansion is 250ms ease-out; reduced-motion renders instantly.
 */
export function AttentionQueue({ items }: { items: QueueItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.key ?? null);

  return (
    <div className="flex flex-col gap-2">
      {items.length > 10 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="text-xs text-iron-600 underline-offset-4 hover:text-foreground hover:underline"
          >
            Collapse all
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-card">
        {items.map((item) => {
          const open = openId === item.key;
          return (
            <div key={item.key} className="border-b border-iron-200 last:border-b-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId((cur) => nextOpenAccordionId(cur, item.key))}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent/40"
              >
                {!open ? (
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full bg-warning"
                  />
                ) : null}
                <AssetCodeChip code={item.code} />
                {/* Open row shows the reason as the amber chip (matches reference state 2);
                    collapsed row shows it as plain text. Never both — no duplicate reason line. */}
                {open ? (
                  <span className="inline-flex rounded-md bg-amber-chip-bg px-2 py-0.5 text-xs text-amber-chip-text">
                    {item.title}
                  </span>
                ) : (
                  <span className="text-[13.5px] text-iron-600">{item.title}</span>
                )}
                {item.count > 1 ? (
                  <span className="rounded-full border border-iron-200 px-1.5 text-[11px] tabular-nums text-iron-600">
                    {item.count} open
                  </span>
                ) : null}
                <span className="ml-auto flex items-center">
                  <Chevron open={open} />
                </span>
              </button>

              {/* Grid-rows height animation — CSS only, so reduced-motion is instant. */}
              <div
                className={cn(
                  "grid transition-all duration-[250ms] ease-out motion-reduce:transition-none",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <div className="flex flex-col gap-2.5 border-t border-iron-200 bg-bone-50 px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      {item.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbUrl}
                          alt=""
                          className="size-12 shrink-0 rounded-md border border-iron-200 object-cover"
                        />
                      ) : null}
                      <p className="text-[13px] text-iron-600">{item.reason}</p>
                    </div>

                    {/* Every unresolved submission for this asset — none hidden. */}
                    <div className="flex flex-col gap-2">
                      {item.submissions.map((s) => (
                        <SubmissionRow key={s.submissionId} s={s} returnTo={item.href} />
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <PrimaryButton href={item.href}>Open in submissions</PrimaryButton>
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
    </div>
  );
}
