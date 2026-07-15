"use client";

import { useActionState } from "react";

import {
  markReturnAndResolve,
  type SubmissionActionState,
} from "@/lib/submissions/actions";
import { submissionStatusActionClasses } from "@/lib/ui/status";

/**
 * "Mark returned & resolve" — the single admin action that completes a return checklist.
 * Mirrors MarkReviewedButton (a form binding a server action + hidden `redirect_to`, no
 * toast/optimistic infra): a native confirm gates the submit, the RPC does the atomic work,
 * and the redirect back carries `?done=` so the caller renders the confirmation banner.
 *
 * Render only for an eligible submission (form_type=return_checklist, status new/reviewed) —
 * `canQuickResolveReturn` in lib/submissions/returns.ts.
 */
export function MarkReturnedResolveButton({
  submissionId,
  redirectTo,
  className,
  dense = false,
}: {
  submissionId: string;
  redirectTo: string;
  className?: string;
  /** Compact single-line size for dense list/table rows (inbox, attention queue) — Wave 3N.4.1. */
  dense?: boolean;
}) {
  const action = markReturnAndResolve.bind(null, submissionId);
  const [state, formAction, pending] = useActionState<
    SubmissionActionState,
    FormData
  >(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Mark this asset returned and resolve this return checklist?"
          )
        ) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <button
        type="submit"
        disabled={pending}
        // Target is "resolved" → track the Resolved (emerald/success) status vocabulary (Phase 3C.5).
        // Nowrap keeps the long label on one line; `dense` gives the compact size for table/list rows.
        className={className ?? submissionStatusActionClasses("resolved", dense)}
      >
        {pending ? "Marking returned…" : "Mark returned & resolve"}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
