"use client";

import { useActionState } from "react";

import {
  setSubmissionStatus,
  type SubmissionActionState,
} from "@/lib/submissions/actions";
import { nextStatusActions } from "@/lib/submissions/status-actions";
import { submissionStatusActionClasses } from "@/lib/ui/status";

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
            className={submissionStatusActionClasses(a.status)}
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
