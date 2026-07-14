"use client";

import { useActionState } from "react";

import {
  setSubmissionStatus,
  type SubmissionActionState,
} from "@/lib/submissions/actions";
import { nextStatusActions, type StatusAction } from "@/lib/submissions/status-actions";

const BASE =
  "inline-flex min-h-9 items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const TONE: Record<StatusAction["tone"], string> = {
  default: `${BASE} hover:bg-accent hover:text-accent-foreground`,
  reopen: `${BASE} text-muted-foreground hover:bg-accent hover:text-accent-foreground`,
  archive: `${BASE} text-muted-foreground hover:bg-accent hover:text-accent-foreground`,
};

/**
 * Direct, state-aware status buttons (Phase 3C.4) — replaces the status <select>. One form, one shared action
 * (`setSubmissionStatus` reads the target from the clicked button's `name="status"` value), so it reuses the
 * single mutation + its server guard. The current status is never offered (see `nextStatusActions`). Archive
 * confirms first. When `hideResolve` is set (an active renter return), the page renders Mark returned & resolve
 * separately instead of an ordinary Resolve.
 */
export function SubmissionStatusActions({
  submissionId,
  status,
  hideResolve = false,
  redirectTo,
}: {
  submissionId: string;
  status: string;
  hideResolve?: boolean;
  redirectTo: string;
}) {
  const action = setSubmissionStatus.bind(null, submissionId);
  const [state, formAction, pending] = useActionState<SubmissionActionState, FormData>(action, {});
  const actions = nextStatusActions(status, { hideResolve });

  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <form action={formAction} className="flex flex-wrap gap-2 sm:justify-end">
        <input type="hidden" name="redirect_to" value={redirectTo} />
        {actions.map((a) => (
          <button
            key={a.status}
            type="submit"
            name="status"
            value={a.status}
            disabled={pending}
            onClick={
              a.tone === "archive"
                ? (e) => {
                    if (
                      !window.confirm(
                        "Archive this submission? It will leave the active queue."
                      )
                    )
                      e.preventDefault();
                  }
                : undefined
            }
            className={TONE[a.tone]}
          >
            {a.label}
          </button>
        ))}
      </form>
      {state.error ? (
        <p role="alert" className="text-xs text-destructive sm:text-right">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
