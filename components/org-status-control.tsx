"use client";

import { useActionState, useState } from "react";

import { setOrgStatus, type OrgSettingsState } from "@/lib/org/actions";

/**
 * Owner-only Suspend / Reactivate control for a customer organization (Wave 5E.1).
 * Rendered only inside platform-owner routes. Two-step: the primary button reveals a
 * confirmation with the consequences spelled out, and only the confirm button fires the
 * `setOrgStatus` server action (which independently re-checks platform-owner authority).
 */
export function OrgStatusControl({
  organizationId,
  status,
}: {
  organizationId: string;
  status: string;
}) {
  const suspended = status === "suspended";
  const nextStatus = suspended ? "active" : "suspended";
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<OrgSettingsState, FormData>(
    setOrgStatus.bind(null, organizationId, nextStatus),
    {}
  );

  const confirmCopy = suspended
    ? "Reactivate this organization?"
    : "Suspend this organization? Customer users will lose access and public scan pages will become unavailable. Data will be preserved.";

  if (!confirming) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={
            suspended
              ? "rounded-md border border-emerald-500/40 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
              : "rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          }
        >
          {suspended ? "Reactivate organization" : "Suspend organization"}
        </button>
        {state.error ? (
          <span role="alert" className="text-xs text-destructive">
            {state.error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <p className="max-w-md text-sm text-muted-foreground">{confirmCopy}</p>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className={
            suspended
              ? "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              : "rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
          }
        >
          {pending
            ? "Saving…"
            : suspended
              ? "Confirm reactivate"
              : "Confirm suspend"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {state.error ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
