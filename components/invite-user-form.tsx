"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { inviteUser, type TeamActionState } from "@/lib/team/actions";
import { roleLabel, type Role } from "@/lib/auth/roles";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

/**
 * Invite form. `routeOrgId` is only used by the platform owner (bound into the
 * action); customer admins pass null and the server forces their own org. The role
 * options are the inviter's allowed roles — the server re-checks them.
 */
export function InviteUserForm({
  routeOrgId,
  allowedRoles,
}: {
  routeOrgId: string | null;
  allowedRoles: Role[];
}) {
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(
    inviteUser.bind(null, routeOrgId),
    {}
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <h2 className="text-sm font-medium">Invite a user</h2>
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Email<span className="text-destructive"> *</span>
          </span>
          <input name="email" type="email" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input name="name" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Role</span>
          <select name="role" defaultValue={allowedRoles[0]} className={inputClass}>
            {allowedRoles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The user receives an email invite and sets their own sign-in. No password is
        created here.
      </p>
    </form>
  );
}
