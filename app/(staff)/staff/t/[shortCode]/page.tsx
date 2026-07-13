import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { resolveOutboundTemplate } from "@/lib/inspections/outbound-templates";

export const dynamic = "force-dynamic";

export default async function StaffAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ shortCode: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shortCode } = await params;
  const sp = await searchParams;
  const started = typeof sp.started === "string" ? sp.started : null;

  const { asset } = await requireStaffAssetByShortCode(shortCode);
  const rented = Boolean(asset.active_rental_session_id);
  const template = resolveOutboundTemplate({
    assignmentKey: asset.return_inspection_template_key,
    category: asset.category,
  });

  // Active session + its baseline outbound inspection (for the admin link), when rented.
  let session: { rental_reference: string | null; renter_label: string | null; started_at: string } | null =
    null;
  let baselineId: string | null = null;
  if (asset.active_rental_session_id) {
    const supabase = await createClient();
    const { data: s } = await supabase
      .from("asset_rental_sessions")
      .select("rental_reference, renter_label, started_at")
      .eq("id", asset.active_rental_session_id)
      .maybeSingle<{ rental_reference: string | null; renter_label: string | null; started_at: string }>();
    session = s ?? null;
    const { data: baseline } = await supabase
      .from("form_submissions")
      .select("id")
      .eq("rental_session_id", asset.active_rental_session_id)
      .eq("form_type", "pre_use_inspection")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    baselineId = baseline?.id ?? null;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Staff workflow
      </div>

      {started ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-muted-foreground">
          Marked rented — baseline recorded. Reference{" "}
          <span className="font-mono">{started}</span>.
        </p>
      ) : null}

      {asset.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.cover_image_url}
          alt=""
          className="aspect-video w-full rounded-lg border object-cover"
        />
      ) : null}

      <section>
        <h1 className="text-2xl font-semibold tracking-tight">{asset.asset_name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{asset.asset_code}</span>
          {asset.category ? <span>{asset.category}</span> : null}
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border bg-card p-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Rental state</dt>
          <dd className="mt-0.5 font-medium">{rented ? "Rented" : "Available"}</dd>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Public page</dt>
          <dd className="mt-0.5 font-medium">
            {asset.public_status === "public" ? "Public" : "Private"}
          </dd>
        </div>
        <div className="col-span-2 rounded-lg border bg-card p-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Outbound inspection</dt>
          <dd className="mt-0.5 font-medium">{template.name}</dd>
        </div>
      </dl>

      {rented && session ? (
        <div className="rounded-lg border bg-card p-3 text-sm">
          <p className="font-medium">Currently rented</p>
          <p className="mt-0.5 text-muted-foreground">
            {[session.renter_label, session.rental_reference].filter(Boolean).join(" · ") ||
              "No renter details recorded."}
          </p>
        </div>
      ) : null}

      {/* Actions */}
      {!rented ? (
        <Link
          href={`/staff/t/${shortCode}/outbound`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Start outbound inspection
        </Link>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-muted-foreground">
            This asset is out on rental — a new outbound session cannot start until it is returned.
          </p>
          {baselineId ? (
            <Link
              href={`/dashboard/submissions/${baselineId}`}
              className="text-sm underline-offset-4 hover:underline"
            >
              View outbound baseline inspection
            </Link>
          ) : null}
          <Link
            href={`/forms/${shortCode}/return`}
            className="text-sm underline-offset-4 hover:underline"
          >
            Open the return inspection
          </Link>
        </div>
      )}

      <Link
        href={`/t/${shortCode}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Public equipment page
      </Link>
    </main>
  );
}
