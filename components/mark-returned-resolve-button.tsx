"use client";

import { useActionState } from "react";

import {
  markReturnAndResolve,
  type SubmissionActionState,
} from "@/lib/submissions/actions";

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
}: {
  submissionId: string;
  redirectTo: string;
  className?: string;
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
        className={
          className ??
          "inline-flex h-[30px] items-center rounded-[7px] border border-iron-200 px-3 text-[13px] transition-colors hover:bg-accent disabled:opacity-50"
        }
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
