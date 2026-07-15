import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireCustomerAdminOrgId } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PrimaryButton } from "@/components/ui/primary-button";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";
import { tagRequestStatusTone } from "@/lib/ui/status";
import { RelativeTime } from "@/components/relative-time";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  status: string;
  material: string | null;
  tag_size: string | null;
  created_at: string;
  tag_request_assets: { count: number }[];
};

export default async function TagRequestsPage() {
  await requireCustomerAdminOrgId();
  const supabase = await createClient();

  // RLS-scoped: only this organization's requests.
  const { data } = await supabase
    .from("tag_requests")
    .select("id, status, material, tag_size, created_at, tag_request_assets(count)")
    .order("created_at", { ascending: false });
  const requests = (data ?? []) as RequestRow[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tag requests"
        description="Request physical QR tags for selected covered assets. Mulemark produces and fulfills approved tag requests."
        actions={
          <PrimaryButton href="/dashboard/tag-requests/new">
            New request
          </PrimaryButton>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          title="No tag requests yet"
          description="When an asset is ready for a durable metal QR tag, request one here — Mulemark reviews the specs, produces the tags, and ships them. Track each request's production status on this page."
          action={
            <PrimaryButton href="/dashboard/tag-requests/new">
              New request
            </PrimaryButton>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-[0.06em] text-iron-600">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Requested</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Assets</th>
                  <th className="px-4 py-2.5 font-medium">Material</th>
                  <th className="px-4 py-2.5 font-medium">Size</th>
                  <th className="px-4 py-2.5 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                      <RelativeTime value={r.created_at} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={tagRequestStatusTone(r.status)}>
                        {tagRequestStatusLabel(r.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground">
                      {r.tag_request_assets?.[0]?.count ?? 0}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.material ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.tag_size ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/dashboard/tag-requests/${r.id}`}>View →</Link>
                      </Button>
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
