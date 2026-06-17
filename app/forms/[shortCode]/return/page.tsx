import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { ReturnForm } from "@/components/public/return-form";
import { PublicFormLayout } from "@/components/public/public-form-layout";
import { UnavailableNotice } from "@/components/public/unavailable-notice";

export const dynamic = "force-dynamic";

export default async function ReturnChecklistPage({
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
      title="Return checklist"
      orgName={resolved.org.name ?? "Rental Equipment"}
      assetName={resolved.asset.asset_name}
      assetCode={resolved.asset.asset_code}
    >
      <ReturnForm shortCode={shortCode} />
    </PublicFormLayout>
  );
}
