import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { resolveReturnTemplate } from "@/lib/inspections/resolve";
import { ReturnInspectionForm } from "@/components/public/return-inspection-form";
import { PublicFormLayout } from "@/components/public/public-form-layout";
import { UnavailableNotice } from "@/components/public/unavailable-notice";

export const dynamic = "force-dynamic";

export default async function ReturnInspectionPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = createPublicClient();

  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) return <UnavailableNotice />;

  // Template resolved server-side: explicit asset assignment → exact category suggestion → generic.
  const template = resolveReturnTemplate({
    assignmentKey: resolved.returnInspectionTemplateKey,
    category: resolved.category,
  });

  return (
    <PublicFormLayout
      shortCode={shortCode}
      title="Return inspection"
      orgName={resolved.org.name ?? "Rental Equipment"}
      assetName={resolved.asset.asset_name}
      assetCode={resolved.asset.asset_code}
    >
      <ReturnInspectionForm template={template} shortCode={shortCode} />
    </PublicFormLayout>
  );
}
