import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { DamageForm } from "@/components/public/damage-form";
import { PublicFormLayout } from "@/components/public/public-form-layout";
import { UnavailableNotice } from "@/components/public/unavailable-notice";

// Public, no-login form. Dynamic — eligibility is resolved per request.
export const dynamic = "force-dynamic";

/**
 * Phase C6. The best-effort notification now runs in `after()`, which the Next.js docs scope to "the
 * platform's default or configured max duration of your route". The notification budget is 15 s
 * (NOTIFICATION_TOTAL_BUDGET_MS), so a platform default of 10 s would truncate a retrying send
 * mid-flight — a new failure mode created purely by deferring. This states the window explicitly
 * instead of inheriting whichever default the plan happens to carry.
 *
 * 60 s comfortably contains upload + insert (~1 s measured) plus the full 15 s notification budget.
 * The consequence of exhausting it is a lost EMAIL, never a lost submission: the row is committed and
 * the renter has been shown their confirmation long before the callback runs.
 */
export const maxDuration = 60;


export default async function DamageReportPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = createPublicClient();

  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) return <UnavailableNotice />;

  return (
    <PublicFormLayout
      shortCode={shortCode}
      title="Report damage"
      orgName={resolved.org.name ?? "Rental Equipment"}
      assetName={resolved.asset.asset_name}
      assetCode={resolved.asset.asset_code}
    >
      <DamageForm shortCode={shortCode} />
    </PublicFormLayout>
  );
}
