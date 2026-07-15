import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { resolveOutboundTemplate } from "@/lib/inspections/outbound-templates";
import { outboundSessionMode } from "@/lib/inspections/outbound-session";
import { submitOutboundInspection } from "@/lib/forms/actions";
import { ReturnInspectionForm } from "@/components/public/return-inspection-form";
import { RentalDetailsFields } from "@/components/rental-details-fields";
import { OutboundSessionGate } from "@/components/staff/outbound-session-gate";
import { RelativeTime } from "@/components/relative-time";
import { submissionReference } from "@/lib/submissions/inbox";

export const dynamic = "force-dynamic";

export default async function StaffOutboundPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const { asset } = await requireStaffAssetByShortCode(shortCode);

  const template = resolveOutboundTemplate({
    assignmentKey: asset.return_inspection_template_key,
    category: asset.category,
  });

  // If a rental session is already active, load it + whether it already has an outbound baseline (Phase 3C.6).
  const supabase = await createClient();
  type SessionRow = {
    id: string;
    started_at: string;
    renter_label: string | null;
    rental_reference: string | null;
  };
  type BaselineRow = { id: string; created_at: string; submitted_by_name: string | null };
  let session: SessionRow | null = null;
  let baseline: BaselineRow | null = null;
  if (asset.active_rental_session_id) {
    const { data: s } = await supabase
      .from("asset_rental_sessions")
      .select("id, started_at, renter_label, rental_reference")
      .eq("id", asset.active_rental_session_id)
      .maybeSingle<SessionRow>();
    session = s ?? null;
    const { data: b } = await supabase
      .from("form_submissions")
      .select("id, created_at, submitted_by_name")
      .eq("rental_session_id", asset.active_rental_session_id)
      .eq("form_type", "pre_use_inspection")
      .maybeSingle<BaselineRow>();
    baseline = b ?? null;
  }

  const mode = outboundSessionMode({
    activeSessionId: asset.active_rental_session_id,
    hasBaseline: !!baseline,
  });

  const header = (
    <div>
      <Link
        href={`/staff/t/${shortCode}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← {asset.asset_name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Outbound inspection</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "attach"
          ? "Record the baseline condition and attach it to the active rental session."
          : "Record the baseline condition before the equipment leaves the yard. Completing marks the asset rented."}
      </p>
    </div>
  );

  // Case 3 — a baseline already exists for the active session: don't create a second one.
  if (mode === "blocked" && session && baseline) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
        {header}
        <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
          <p className="font-medium">An outbound inspection is already recorded for this rental session.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
            <dt>Recorded</dt>
            <dd className="text-foreground">
              <RelativeTime value={baseline.created_at} />
            </dd>
            <dt>Inspector</dt>
            <dd className="text-foreground">{baseline.submitted_by_name ?? "Staff"}</dd>
            <dt>Reference</dt>
            <dd className="font-mono text-foreground">
              {submissionReference(baseline.id, baseline.created_at)}
            </dd>
          </dl>
          <div className="flex flex-col gap-2">
            <Link
              href={`/staff/t/${shortCode}/submissions/${baseline.id}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              View outbound inspection
            </Link>
            <Link
              href={`/staff/t/${shortCode}/evidence/${session.id}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              View session evidence
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const form = (
    <ReturnInspectionForm
      template={template}
      shortCode={shortCode}
      action={submitOutboundInspection.bind(null, shortCode)}
      disclaimer="Outbound (pre-use) inspection — a baseline record of the equipment's condition and accessories as it leaves the yard."
      reviewCta="Review outbound inspection"
      submitCta={mode === "attach" ? "Complete outbound inspection" : "Complete inspection & mark rented"}
      submittingCta={mode === "attach" ? "Saving baseline…" : "Starting rental…"}
      contextTitle="Rental details (optional)"
      contextFields={
        <RentalDetailsFields
          idPrefix="outbound-rental"
          renterLabel={session?.renter_label}
          rentalReference={session?.rental_reference}
        />
      }
    />
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
      {header}
      {mode === "attach" && session ? (
        <OutboundSessionGate
          startedAt={session.started_at}
          renterLabel={session.renter_label}
          rentalReference={session.rental_reference}
          cancelHref={`/staff/t/${shortCode}`}
        >
          {form}
        </OutboundSessionGate>
      ) : (
        form
      )}
    </main>
  );
}
