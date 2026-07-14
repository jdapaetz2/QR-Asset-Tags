import Link from "next/link";
import { redirect } from "next/navigation";

import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { resolveOutboundTemplate } from "@/lib/inspections/outbound-templates";
import { submitOutboundInspection } from "@/lib/forms/actions";
import { ReturnInspectionForm } from "@/components/public/return-inspection-form";

export const dynamic = "force-dynamic";

const contextInputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export default async function StaffOutboundPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const { asset } = await requireStaffAssetByShortCode(shortCode);

  // Already rented → no second outbound session; bounce back to the summary.
  if (asset.active_rental_session_id) redirect(`/staff/t/${shortCode}`);

  const template = resolveOutboundTemplate({
    assignmentKey: asset.return_inspection_template_key,
    category: asset.category,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-8">
      <div>
        <Link
          href={`/staff/t/${shortCode}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {asset.asset_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Outbound inspection</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record the baseline condition before the equipment leaves the yard. Submitting marks the asset
          rented.
        </p>
      </div>

      <ReturnInspectionForm
        template={template}
        shortCode={shortCode}
        action={submitOutboundInspection.bind(null, shortCode)}
        disclaimer="Outbound (pre-use) inspection — a baseline record of the equipment's condition and accessories as it leaves the yard."
        reviewCta="Review outbound inspection"
        submitCta="Complete inspection & mark rented"
        submittingCta="Starting rental…"
        contextTitle="Rental details (optional)"
        contextFields={
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span>Renter / customer</span>
              <input name="renter_label" className={contextInputClass} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Rental reference</span>
              <input name="rental_reference" className={contextInputClass} autoComplete="off" />
            </label>
            <p className="text-xs text-muted-foreground">
              Optional — a customer name / PO helps match this rental later.
            </p>
          </>
        }
      />
    </main>
  );
}
