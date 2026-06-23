"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  updateTagRequest,
  type TagRequestOwnerState,
} from "@/lib/tags/owner-actions";
import {
  TAG_REQUEST_STATUSES,
  tagRequestStatusLabel,
} from "@/lib/tags/tag-requests";

const fieldClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

/** Platform-owner controls: update status + internal production notes. */
export function TagRequestStatusForm({
  tagRequestId,
  currentStatus,
  productionNotes,
}: {
  tagRequestId: string;
  currentStatus: string;
  productionNotes: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    TagRequestOwnerState,
    FormData
  >(updateTagRequest.bind(null, tagRequestId), {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Status</span>
        <select
          name="status"
          defaultValue={currentStatus}
          className={`${fieldClass} max-w-xs`}
        >
          {TAG_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tagRequestStatusLabel(s)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Internal production notes</span>
        <textarea
          name="production_notes"
          rows={3}
          defaultValue={productionNotes ?? ""}
          placeholder="Not shown to the customer."
          className={`${fieldClass} w-full max-w-xl`}
        />
      </label>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Update request"}
      </Button>
    </form>
  );
}
