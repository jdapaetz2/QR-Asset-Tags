"use client";

import { useActionState } from "react";

import {
  setSubmissionStatus,
  type SubmissionActionState,
} from "@/lib/submissions/actions";

/**
 * Inline quick-status buttons for an inbox row. Reuses the vetted
 * `setSubmissionStatus` action (RLS-scoped; a cross-org id updates 0 rows) and
 * redirects back to the current list URL so the row updates in place. The full
 * status control still lives on the detail page.
 */
export function SubmissionQuickStatus({
  submissionId,
  current,
  redirectTo,
}: {
  submissionId: string;
  current: string;
  redirectTo: string;
}) {
  const action = setSubmissionStatus.bind(null, submissionId);
  const [state, formAction, pending] = useActionState<
    SubmissionActionState,
    FormData
  >(action, {});

  const btn =
    "rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <button
        type="submit"
        name="status"
        value="reviewed"
        disabled={pending || current === "reviewed"}
        className={btn}
        title="Mark reviewed"
      >
        Reviewed
      </button>
      <button
        type="submit"
        name="status"
        value="resolved"
        disabled={pending || current === "resolved"}
        className={btn}
        title="Mark resolved"
      >
        Resolved
      </button>
      {state.error ? (
        <span role="alert" className="sr-only">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
