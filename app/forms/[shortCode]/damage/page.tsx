import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { DamageForm } from "@/components/public/damage-form";
import { PublicFormLayout } from "@/components/public/public-form-layout";
import { UnavailableNotice } from "@/components/public/unavailable-notice";

// Public, no-login form. Dynamic — eligibility is resolved per request.
export const dynamic = "force-dynamic";

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
