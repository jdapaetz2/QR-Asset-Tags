import Link from "next/link";
import { redirect } from "next/navigation";

import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { resolveStaffReturnTemplate } from "@/lib/inspections/staff-return-templates";
import { submitStaffReturnInspection } from "@/lib/forms/actions";
import { ReturnInspectionForm } from "@/components/public/return-inspection-form";

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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Staff return inspection</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record the equipment&apos;s condition at return. Completing this marks the asset available and
          closes the rental — no separate step needed.
        </p>
      </div>

      <ReturnInspectionForm
        template={template}
        shortCode={shortCode}
        action={submitStaffReturnInspection.bind(null, shortCode)}
        disclaimer="Staff return inspection — records the equipment's condition at return and completes the rental. Damage or missing items stay open for follow-up."
        reviewCta="Review return inspection"
        submitCta="Complete return inspection"
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
