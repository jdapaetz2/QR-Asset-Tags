import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { resolveOutboundTemplate } from "@/lib/inspections/outbound-templates";
import { staffOutboundState } from "@/lib/staff/workflow-state";
import { RelativeTime } from "@/components/relative-time";

export const dynamic = "force-dynamic";

// Shared action button classes (Phase 3C.7). One filled primary per state; secondaries are bordered.
const PRIMARY_ACTION =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90";
const SECONDARY_ACTION =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground";

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
  const attached = typeof sp.attached === "string" ? sp.attached : null;

  const { asset } = await requireStaffAssetByShortCode(shortCode);
  const rented = Boolean(asset.active_rental_session_id);
  const template = resolveOutboundTemplate({
    assignmentKey: asset.return_inspection_template_key,
    category: asset.category,
  });

  // Active session + its baseline outbound inspection, when rented. Two batched reads (no N+1). The state
  // matrix below is driven by ACTUAL session + baseline data, never inferred from the asset's rental flag.
  const sessionId = asset.active_rental_session_id;
  let session:
    | { rental_reference: string | null; renter_label: string | null; started_at: string }
    | null = null;
  let baseline: { id: string; created_at: string; submitted_by_name: string | null } | null = null;
  if (sessionId) {
    const supabase = await createClient();
    const { data: s } = await supabase
      .from("asset_rental_sessions")
      .select("rental_reference, renter_label, started_at")
      .eq("id", sessionId)
      .maybeSingle<{ rental_reference: string | null; renter_label: string | null; started_at: string }>();
    session = s ?? null;
    const { data: b } = await supabase
      .from("form_submissions")
      .select("id, created_at, submitted_by_name")
      .eq("rental_session_id", sessionId)
      .eq("form_type", "pre_use_inspection")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; created_at: string; submitted_by_name: string | null }>();
    baseline = b ?? null;
  }
  const baselineId = baseline?.id ?? null;

  // available | attach | recorded | error — see lib/staff/workflow-state.ts.
  const state = staffOutboundState({
    rented,
    sessionLoaded: session !== null,
    hasBaseline: baselineId !== null,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Staff workflow
      </div>

      {started ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-muted-foreground">
          Outbound inspection completed — asset is now rented, rental session started. Reference{" "}
          <span className="font-mono">{started}</span>.
        </p>
      ) : attached ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-muted-foreground">
          Outbound inspection added to active rental — existing rental session preserved, asset remains rented.
          Reference <span className="font-mono">{attached}</span>.
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

      {/* Workflow state matrix (Phase 3C.7). Each state surfaces exactly one primary action + the safe
          secondaries for that state — driven by the real session + baseline data above. */}
      {state === "available" ? (
        <div className="flex flex-col gap-2">
          <Link href={`/staff/t/${shortCode}/outbound`} className={PRIMARY_ACTION}>
            Start outbound inspection
          </Link>
          <p className="text-sm text-muted-foreground">
            Record the equipment&apos;s condition before it leaves the yard. Completing the inspection
            starts the rental session.
          </p>
        </div>
      ) : state === "attach" && session ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">Active rental has no outbound baseline</p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-muted-foreground">
              <dt>Started</dt>
              <dd className="text-foreground">
                <RelativeTime value={session.started_at} />
              </dd>
              <dt>Renter</dt>
              <dd className="text-foreground">{session.renter_label ?? "Not provided"}</dd>
              <dt>Reference</dt>
              <dd className="text-foreground">{session.rental_reference ?? "Not provided"}</dd>
            </dl>
          </div>
          <p className="text-sm text-muted-foreground">
            Add the outbound inspection to this active rental session. The original rental start time
            will be preserved.
          </p>
          <Link href={`/staff/t/${shortCode}/outbound`} className={PRIMARY_ACTION}>
            Add outbound inspection
          </Link>
          <Link href={`/staff/t/${shortCode}/evidence/${sessionId}`} className={SECONDARY_ACTION}>
            View session evidence
          </Link>
          <Link href={`/staff/t/${shortCode}/return`} className={SECONDARY_ACTION}>
            Complete return checklist
          </Link>
        </div>
      ) : state === "recorded" && baseline ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
            <p className="font-medium">Outbound baseline recorded</p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-muted-foreground">
              <dt>Recorded</dt>
              <dd className="text-foreground">
                <RelativeTime value={baseline.created_at} />
              </dd>
              <dt>Inspector</dt>
              <dd className="text-foreground">{baseline.submitted_by_name ?? "—"}</dd>
            </dl>
          </div>
          <Link href={`/staff/t/${shortCode}/return`} className={PRIMARY_ACTION}>
            Complete return checklist
          </Link>
          {baselineId ? (
            <Link href={`/staff/t/${shortCode}/submissions/${baselineId}`} className={SECONDARY_ACTION}>
              View outbound inspection
            </Link>
          ) : null}
          <Link href={`/staff/t/${shortCode}/evidence/${sessionId}`} className={SECONDARY_ACTION}>
            View session evidence
          </Link>
        </div>
      ) : (
        // error: rented, but the active session row could not be loaded — never offer Start/Add here.
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">Rental session details unavailable</p>
          <p className="mt-0.5 text-muted-foreground">
            This asset is marked rented, but its active rental session could not be loaded. Refresh the
            page, or open the asset in the dashboard to continue.
          </p>
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
