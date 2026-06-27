import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { getTagRequestDetail } from "@/lib/tags/request-detail";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";
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
  await requireOrgId();
  const { id } = await params;
  const supabase = await createClient();

  // RLS-scoped: a request from another org isn't returned → 404.
  const { request, assets } = await getTagRequestDetail(supabase, id);
  if (!request) notFound();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard/tag-requests"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Tag requests
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          Tag request
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
            {tagRequestStatusLabel(request.status)}
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Requested {formatDate(request.created_at)}
          {request.delivered_at
            ? ` · delivered ${formatDate(request.delivered_at)}`
            : ""}
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-muted-foreground">
          <dt>Material</dt>
          <dd className="text-foreground">{request.material ?? "—"}</dd>
          <dt>Mounting</dt>
          <dd className="text-foreground">{request.mounting_method ?? "—"}</dd>
          <dt>Tag size</dt>
          <dd className="text-foreground">{request.tag_size ?? "—"}</dd>
          <dt>Quantity / notes</dt>
          <dd className="text-foreground">{request.quantity_notes ?? "—"}</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Assets ({assets.length})
        </h2>
        <TagRequestAssets assets={assets} />
      </section>
    </div>
  );
}
