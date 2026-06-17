"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  setSubmissionStatus,
  type SubmissionActionState,
} from "@/lib/submissions/actions";
import { SUBMISSION_STATUSES } from "@/lib/submissions/display";

export function SubmissionStatusForm({
  submissionId,
  current,
}: {
  submissionId: string;
  current: string;
}) {
  const action = setSubmissionStatus.bind(null, submissionId);
  const [state, formAction, pending] = useActionState<
    SubmissionActionState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Status</span>
        <select
          name="status"
          defaultValue={current}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
        >
          {SUBMISSION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status[0].toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending} variant="outline">
        {pending ? "Saving…" : "Update"}
      </Button>
      {state.error ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
