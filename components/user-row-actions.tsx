"use client";

import { useActionState } from "react";

import {
  setUserStatus,
  setUserRole,
  type TeamActionState,
} from "@/lib/team/actions";
import { ROLES } from "@/lib/auth/roles";

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
}: {
  profileId: string;
  role: string;
  status: string;
  redirectTo: string;
  canManage: boolean;
  canChangeRole: boolean;
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

  if (!canManage && !canChangeRole) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const error = statusState.error ?? roleState.error;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
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
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
