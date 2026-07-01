import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES, roleLabel } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InviteUserForm } from "@/components/invite-user-form";
import { UserRowActions } from "@/components/user-row-actions";
import {
  invitableRoles,
  canManageMember,
  profileStatusLabel,
  type ProfileStatus,
} from "@/lib/auth/invitations";
import type { BadgeTone } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  auth_user_id: string;
  created_at: string;
};

const STATUS_TONE: Record<ProfileStatus, BadgeTone> = {
  active: "success",
  invited: "info",
  disabled: "neutral",
};

function statusTone(status: string): BadgeTone {
  return STATUS_TONE[status as ProfileStatus] ?? "neutral";
}

export default async function DashboardUsersPage() {
  // Customer admins only — staff are redirected to their landing.
  const actor = await requireRole(ROLES.CUSTOMER_ADMIN);
  const organizationId = actor.organization_id;

  const supabase = await createClient();
  // RLS scopes profiles to the caller's own organization already; the eq is explicit.
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, role, status, auth_user_id, created_at")
    .eq("organization_id", organizationId ?? "")
    .order("created_at", { ascending: true });
  const users = (data ?? []) as UserRow[];

  const listHref = "/dashboard/settings/users";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/settings"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Settings
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Team"
            description="Invite staff and manage who can access your dashboard."
          />
        </div>
      </div>

      <InviteUserForm
        routeOrgId={null}
        allowedRoles={invitableRoles(ROLES.CUSTOMER_ADMIN)}
      />

      {users.length === 0 ? (
        <EmptyState
          title="No team members yet"
          description="Invite staff so they can review submissions and manage equipment for your yard."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.auth_user_id === actor.auth_user_id;
                const manageable =
                  !isSelf &&
                  canManageMember({
                    actorRole: actor.role,
                    actorOrgId: actor.organization_id,
                    targetRole: u.role,
                    targetOrgId: organizationId,
                  });
                return (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {u.name ?? "—"}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{u.email ?? "—"}</td>
                    <td className="px-4 py-2">{roleLabel(u.role)}</td>
                    <td className="px-4 py-2">
                      <Badge tone={statusTone(u.status)}>
                        {profileStatusLabel(u.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <UserRowActions
                        profileId={u.id}
                        role={u.role}
                        status={u.status}
                        redirectTo={listHref}
                        canManage={manageable}
                        canChangeRole={false}
                        canRegenerate={manageable && u.status === "invited"}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
