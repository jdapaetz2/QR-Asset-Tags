"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  setSubmissionStatus,
  type SubmissionActionState,
} from "@/lib/submissions/actions";
import { nextStatusActions } from "@/lib/submissions/status-actions";
import { submissionStatusActionClasses } from "@/lib/ui/status";
import { statusPendingLabel } from "@/lib/ui/pending-labels";

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
  const [state, formAction] = useActionState<SubmissionActionState, FormData>(action, {});
  const actions = nextStatusActions(status, { hideResolve });

  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <form action={formAction} className="flex flex-wrap gap-2 sm:justify-end">
        <input type="hidden" name="redirect_to" value={redirectTo} />
        {actions.map((a) => (
          <StatusButton key={a.status} status={a.status} label={a.label} tone={a.tone} />
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

/**
 * One status button, reading `useFormStatus` so it knows not just THAT the form is submitting but WHICH
 * button was pressed — the hook exposes the submitted `FormData`, and each button carries its target as
 * `name="status"`.
 *
 * Phase C8. Acknowledgement was already prompt (measured at 57 ms) but indiscriminate: pressing Resolve
 * greyed out Resolve, Reviewed and Archive identically, so the operator could see that something was
 * happening but not what. Only the pressed button now takes the pending wording; the others simply
 * disable, which is still the correct duplicate-submit guard.
 *
 * The label says "Resolving…", never "Resolved". The server has not answered yet.
 */
function StatusButton({
  status,
  label,
  tone,
}: {
  status: string;
  label: string;
  tone?: string;
}) {
  const { pending, data } = useFormStatus();
  const submittingThis = pending && data?.get("status") === status;
  const pendingLabel = statusPendingLabel(status);

  return (
    <button
      type="submit"
      name="status"
      value={status}
      disabled={pending}
      aria-busy={submittingThis}
      onClick={
        tone === "archive"
          ? (e) => {
              if (!window.confirm("Archive this submission? It will leave the active queue."))
                e.preventDefault();
            }
          : undefined
      }
      className={submissionStatusActionClasses(status)}
    >
      {submittingThis && pendingLabel ? pendingLabel : label}
    </button>
  );
}
