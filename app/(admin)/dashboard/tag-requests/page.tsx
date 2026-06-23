import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  status: string;
  material: string | null;
  tag_size: string | null;
  created_at: string;
  tag_request_assets: { count: number }[];
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default async function TagRequestsPage() {
  await requireOrgId();
  const supabase = await createClient();

  // RLS-scoped: only this organization's requests.
  const { data } = await supabase
    .from("tag_requests")
    .select("id, status, material, tag_size, created_at, tag_request_assets(count)")
    .order("created_at", { ascending: false });
  const requests = (data ?? []) as RequestRow[];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tag requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Request physical QR tags — AssetTag QR produces and fulfills them.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/tag-requests/new">New request</Link>
        </Button>
      </section>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Requested</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Assets</th>
              <th className="px-4 py-2 font-medium">Material</th>
              <th className="px-4 py-2 font-medium">Size</th>
              <th className="px-4 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No tag requests yet.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {tagRequestStatusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.tag_request_assets?.[0]?.count ?? 0}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.material ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.tag_size ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Link
                      href={`/dashboard/tag-requests/${r.id}`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      View
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
