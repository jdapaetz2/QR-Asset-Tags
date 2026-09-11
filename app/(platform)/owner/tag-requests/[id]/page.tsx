import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { getTagRequestDetail } from "@/lib/tags/request-detail";
import { tagRequestStatusLabel, type TagRequestInternal } from "@/lib/tags/tag-requests";
import { TagRequestAssets } from "@/components/tag-request-assets";
import { TagRequestStatusForm } from "@/components/tag-request-status-form";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default async function OwnerTagRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(ROLES.PLATFORM_OWNER);
  const { id } = await params;
  const supabase = await createClient();

  const { request, assets } = await getTagRequestDetail(supabase, id);
  if (!request) notFound();

  // Internal production notes are not selectable by `authenticated` (migration 0035); the owner reads them through
  // the owner-only database function, which returns nothing to any other caller.
  const { data: internalRows } = await supabase.rpc("owner_tag_request_internal", {
    p_tag_request_id: id,
  });
  const productionNotes =
    ((internalRows ?? []) as TagRequestInternal[])[0]?.production_notes ?? null;

  // Opening the request marks it viewed (idempotent; only ever sets it once, and never touches status). The function
  // enforces the platform-owner check in the database.
  await supabase.rpc("mark_tag_request_viewed", { p_tag_request_id: id });

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", request.organization_id)
    .maybeSingle();

  // Jump to the production workspace prefilled with this request's assets + spec.
  const productionParams = new URLSearchParams();
  productionParams.set("org", request.organization_id);
  for (const a of assets) productionParams.append("select", a.id);
  if (request.tag_size) productionParams.set("tag_size", request.tag_size);
  if (request.material) productionParams.set("material", request.material);
  if (request.mounting_method) {
    productionParams.set("mounting_method", request.mounting_method);
  }
  if (productionNotes) {
    productionParams.set("production_notes", productionNotes);
  }
  const productionHref = `/owner/production?${productionParams.toString()}`;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href={`/owner/tag-requests?org=${request.organization_id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {org?.name ?? "Organization"} tag requests
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {org?.name ?? "Organization"} — tag request
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Assets ({assets.length})
          </h2>
          <Link
            href={productionHref}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Open in production →
          </Link>
        </div>
        <TagRequestAssets assets={assets} />
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-medium">Manage request</h2>
        <TagRequestStatusForm
          tagRequestId={request.id}
          currentStatus={request.status}
          productionNotes={productionNotes}
        />
      </section>
    </div>
  );
}
