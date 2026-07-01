"use client";

import { useActionState } from "react";

import {
  setUserStatus,
  setUserRole,
  regenerateInvite,
  type TeamActionState,
} from "@/lib/team/actions";
import { ROLES } from "@/lib/auth/roles";
import { CopyableUrl } from "@/components/copyable-url";

const btn =
  "rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40";

/**
 * Inline per-row team actions. Rendered only when the server-computed `canManage`
 * (and `canChangeRole`) are true; the actions re-check the actor's authority anyway.
 * `redirectTo` returns the operator to the same list after a change.
 */
export function UserRowActions({
  profileId,
  role,
  status,
  redirectTo,
  canManage,
  canChangeRole,
  canRegenerate,
}: {
  profileId: string;
  role: string;
  status: string;
  redirectTo: string;
  canManage: boolean;
  canChangeRole: boolean;
  canRegenerate: boolean;
}) {
  const nextStatus = status === "disabled" ? "active" : "disabled";
  const [statusState, statusAction, statusPending] = useActionState<
    TeamActionState,
    FormData
  >(setUserStatus.bind(null, profileId, nextStatus), {});

  const nextRole =
    role === ROLES.CUSTOMER_ADMIN ? ROLES.CUSTOMER_STAFF : ROLES.CUSTOMER_ADMIN;
  const [roleState, roleAction, rolePending] = useActionState<
    TeamActionState,
    FormData
  >(setUserRole.bind(null, profileId, nextRole), {});

  const [regenState, regenAction, regenPending] = useActionState<
    TeamActionState,
    FormData
  >(regenerateInvite.bind(null, profileId), {});

  if (!canManage && !canChangeRole && !canRegenerate) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const error = statusState.error ?? roleState.error ?? regenState.error;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1">
        {canRegenerate ? (
          <form action={regenAction}>
            <button type="submit" disabled={regenPending} className={btn}>
              {regenPending ? "…" : "New invite link"}
            </button>
          </form>
        ) : null}
        {canChangeRole ? (
          <form action={roleAction}>
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <button type="submit" disabled={rolePending} className={btn}>
              {role === ROLES.CUSTOMER_ADMIN ? "Make staff" : "Make admin"}
            </button>
          </form>
        ) : null}
        {canManage ? (
          <form action={statusAction}>
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <button type="submit" disabled={statusPending} className={btn}>
              {status === "disabled" ? "Enable" : "Disable"}
            </button>
          </form>
        ) : null}
      </div>
      {regenState.invite ? (
        <div className="flex w-full max-w-xs flex-col gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-left">
          <span className="text-xs font-medium">New invite link</span>
          <CopyableUrl url={regenState.invite.url} />
          <span className="text-[11px] text-amber-700 dark:text-amber-500">
            Copy and send now — replaces the previous link.
          </span>
        </div>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
