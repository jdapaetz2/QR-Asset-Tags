import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES, roleLabel } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { profileStatusLabel, type ProfileStatus } from "@/lib/auth/invitations";
import type { BadgeTone } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  organization_id: string | null;
  created_at: string;
  organization: { name: string } | null;
};

const STATUS_TONE: Record<ProfileStatus, BadgeTone> = {
  active: "success",
  invited: "info",
  disabled: "neutral",
};

function statusTone(status: string): BadgeTone {
  return STATUS_TONE[status as ProfileStatus] ?? "neutral";
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default async function OwnerUsersPage() {
  await requireRole(ROLES.PLATFORM_OWNER);

  const supabase = await createClient();
  // Owner RLS reads all profiles. Read-only overview — management lives per-org.
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, name, email, role, status, organization_id, created_at, organization:organizations(name)"
    )
    .order("created_at", { ascending: true });
  const users = (data ?? []) as unknown as UserRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/owner"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Organizations
        </Link>
        <div className="mt-2">
          <PageHeader
            title="All users"
            description={`${users.length} user${users.length === 1 ? "" : "s"} across all organizations. Manage members from each organization's Users page.`}
          />
        </div>
      </div>

      {users.length === 0 ? (
        <EmptyState title="No users yet" description="Invite users from an organization's Users page." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{u.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.email ?? "—"}</td>
                  <td className="px-4 py-2">{roleLabel(u.role)}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {u.organization_id ? (
                      <Link
                        href={`/owner/organizations/${u.organization_id}/users`}
                        className="underline-offset-4 hover:underline"
                      >
                        {u.organization?.name ?? "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(u.status)}>
                      {profileStatusLabel(u.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDate(u.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
