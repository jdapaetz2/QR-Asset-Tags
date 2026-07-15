import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireCustomerAdminOrgId } from "@/lib/auth/session";
import { getTagRequestDetail } from "@/lib/tags/request-detail";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";
import { tagRequestStatusTone } from "@/lib/ui/status";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { TagRequestAssets } from "@/components/tag-request-assets";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default async function CustomerTagRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCustomerAdminOrgId();
  const { id } = await params;
  const supabase = await createClient();

  // RLS-scoped: a request from another org isn't returned → 404.
  const { request, assets } = await getTagRequestDetail(supabase, id);
  if (!request) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/tag-requests"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Tag requests
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Tag request"
            description={
              <>
                Requested {formatDate(request.created_at)}
                {request.delivered_at
                  ? ` · delivered ${formatDate(request.delivered_at)}`
                  : ""}
              </>
            }
            actions={
              <Badge tone={tagRequestStatusTone(request.status)}>
                {tagRequestStatusLabel(request.status)}
              </Badge>
            }
          />
        </div>
      </div>

      <SectionCard
        title="Tag specification"
        description="Mulemark produces the tags to these specs."
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
          <dt>Material</dt>
          <dd className="text-foreground">{request.material ?? "—"}</dd>
          <dt>Mounting</dt>
          <dd className="text-foreground">{request.mounting_method ?? "—"}</dd>
          <dt>Tag size</dt>
          <dd className="text-foreground">{request.tag_size ?? "—"}</dd>
          <dt>Quantity / notes</dt>
          <dd className="text-foreground">{request.quantity_notes ?? "—"}</dd>
        </dl>
      </SectionCard>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-iron-600">
          Assets ({assets.length})
        </h2>
        <TagRequestAssets assets={assets} />
      </section>
    </div>
  );
}
