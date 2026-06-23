import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import {
  TAG_REQUEST_STATUSES,
  tagRequestStatusLabel,
  isTagRequestStatus,
  parseViewedFilter,
} from "@/lib/tags/tag-requests";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type RequestRow = {
  id: string;
  status: string;
  material: string | null;
  tag_size: string | null;
  created_at: string;
  platform_viewed_at: string | null;
  organization_id: string;
  organizations: { name: string | null } | null;
  tag_request_assets: { count: number }[];
};

function firstString(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

const selectClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export default async function OwnerTagRequestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(ROLES.PLATFORM_OWNER);
  const sp = await searchParams;
  const statusFilter = firstString(sp.status);
  const orgFilter = firstString(sp.org);
  const viewedFilter = parseViewedFilter(firstString(sp.viewed));

  const supabase = await createClient();

  // Owner sees all orgs' requests (RLS owner bypass). Unviewed/new sort to the top.
  let query = supabase
    .from("tag_requests")
    .select(
      "id, status, material, tag_size, created_at, platform_viewed_at, organization_id, organizations(name), tag_request_assets(count)"
    )
    .order("platform_viewed_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });
  if (isTagRequestStatus(statusFilter)) query = query.eq("status", statusFilter);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  if (viewedFilter === "unviewed") query = query.is("platform_viewed_at", null);

  const { data } = await query;
  const requests = (data ?? []) as unknown as RequestRow[];

  const { data: orgData } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name", { ascending: true });
  const orgs = (orgData ?? []) as { id: string; name: string | null }[];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tag requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {requests.length} request{requests.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/owner"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Organizations
        </Link>
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select name="status" defaultValue={statusFilter} className={selectClass}>
            <option value="">All</option>
            {TAG_REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tagRequestStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Organization</span>
          <select name="org" defaultValue={orgFilter} className={selectClass}>
            <option value="">All</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name ?? o.id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">View</span>
          <select name="viewed" defaultValue={viewedFilter} className={selectClass}>
            <option value="all">All</option>
            <option value="unviewed">New / unviewed</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Filter
        </button>
        <Link
          href="/owner/tag-requests"
          className="px-1 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Requested</th>
              <th className="px-4 py-2 font-medium">Organization</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Assets</th>
              <th className="px-4 py-2 font-medium">Spec</th>
              <th className="px-4 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No tag requests.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {r.organizations?.name ?? "—"}
                      {r.platform_viewed_at === null ? (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-500">
                          New
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {tagRequestStatusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.tag_request_assets?.[0]?.count ?? 0}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {[r.material, r.tag_size].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Link
                      href={`/owner/tag-requests/${r.id}`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
