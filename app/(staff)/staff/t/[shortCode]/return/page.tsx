import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { resolveStaffReturnTemplate } from "@/lib/inspections/staff-return-templates";
import {
  outboundBaselineHints,
  summarizeRenterReport,
} from "@/lib/inspections/session-context";
import { submitStaffReturnInspection } from "@/lib/forms/actions";
import { ReturnInspectionForm } from "@/components/public/return-inspection-form";
import { RelativeTime } from "@/components/relative-time";
import type { ReturnInspectionData } from "@/lib/inspections/types";

export const dynamic = "force-dynamic";

export default async function StaffReturnPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const { profile, asset } = await requireStaffAssetByShortCode(shortCode);

  // Nothing to return unless the asset is currently rented → back to the summary.
  const sessionId = asset.active_rental_session_id;
  if (!sessionId) redirect(`/staff/t/${shortCode}`);

  const template = resolveStaffReturnTemplate({
    assignmentKey: asset.return_inspection_template_key,
    category: asset.category,
  });

  // Session context, linked by rental_session_id ONLY (never asset alone). RLS-scoped to the caller's org.
  const supabase = await createClient();
  const [{ data: outboundRow }, { data: renterRows }] = await Promise.all([
    supabase
      .from("form_submissions")
      .select("submission_data_json")
      .eq("rental_session_id", sessionId)
      .eq("form_type", "pre_use_inspection")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ submission_data_json: unknown }>(),
    supabase
      .from("form_submissions")
      .select("id, created_at, submission_data_json, media_urls")
      .eq("rental_session_id", sessionId)
      .eq("form_type", "return_checklist")
      .eq("submission_origin", "public")
      .order("created_at", { ascending: false }),
  ]);

  const baseline = outboundBaselineHints(
    (outboundRow?.submission_data_json ?? null) as ReturnInspectionData | null
  );
  const hasOutbound = !!outboundRow;
  const renterReports = (renterRows ?? []).map((r) =>
    summarizeRenterReport(r as { id: string; created_at: string; submission_data_json: unknown; media_urls: unknown })
  );

  const identity = profile.name ?? profile.email ?? "Signed-in staff";
  const identitySub = profile.name ? profile.email : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
      <div>
        <Link
          href={`/staff/t/${shortCode}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {asset.asset_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Staff return checklist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record the equipment&apos;s condition at return. Completing this marks the asset available and
          closes the rental — no separate step needed.
        </p>
      </div>

      {/* Renter report context (Part B). Operational context only — inspect the asset independently. */}
      {renterReports.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Renter return checklist received</p>
          <p className="text-xs text-muted-foreground">
            Context only — inspect the equipment yourself before recording your answers.
          </p>
          {renterReports.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 rounded-md border bg-card p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
                <span className="text-xs text-muted-foreground">
                  <RelativeTime value={r.createdAt} />
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span>{r.damage ? "Damage reported" : "No damage reported"}</span>
                <span>·</span>
                <span>{r.missing ? "Accessories missing" : "Accessories complete"}</span>
                <span>·</span>
                <span>
                  {r.photoCount} photo{r.photoCount === 1 ? "" : "s"}
                </span>
              </div>
              {r.notes ? <p className="text-xs text-muted-foreground">“{r.notes}”</p> : null}
              <Link
                href={`/staff/t/${shortCode}/submissions/${r.id}`}
                className="text-xs underline-offset-4 hover:underline"
              >
                Open report →
              </Link>
            </div>
          ))}
        </section>
      ) : null}

      {!hasOutbound ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          No outbound baseline recorded for this rental — inspect and record the current condition.
        </p>
      ) : null}

      <ReturnInspectionForm
        template={template}
        shortCode={shortCode}
        action={submitStaffReturnInspection.bind(null, shortCode)}
        baseline={baseline}
        disclaimer="Staff return checklist — records the equipment's condition at return and completes the rental. Damage or missing items stay open for follow-up."
        reviewCta="Review return checklist"
        submitCta="Complete return checklist"
        submittingCta="Completing…"
        contextTitle="Performed by"
        contextFields={
          <>
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed by</p>
              <p className="mt-0.5 font-medium">{identity}</p>
              {identitySub ? (
                <p className="text-xs text-muted-foreground">{identitySub}</p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Your signed-in account will be recorded with this inspection.
            </p>
            <input type="hidden" name="expected_session_id" value={sessionId} />
          </>
        }
      />
    </main>
  );
}
