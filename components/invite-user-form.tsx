"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { CopyableUrl } from "@/components/copyable-url";
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
          {pending ? "Creating…" : "Create invite link"}
        </Button>
      </div>

      {state.invite ? (
        <div className="flex flex-col gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium">
            {state.invite.regenerated
              ? "Invite link regenerated"
              : "Invite created"}
          </p>
          <p className="text-xs text-muted-foreground">
            {state.invite.email} · {roleLabel(state.invite.role)} · Invited
          </p>
          <CopyableUrl url={state.invite.url} />
          <p className="text-xs text-muted-foreground">
            {state.invite.regenerated
              ? "Copy and send this fresh link — the previous link is replaced."
              : "Send this link to the user — they click it, set a password, and get access. It expires per your Supabase auth settings."}
          </p>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
            Copy this link now. For security, it may not be shown again.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Creates a copyable invite link (no email is sent). Send it to the person; they
          set their own password. No password is created here.
        </p>
      )}
    </form>
  );
}
