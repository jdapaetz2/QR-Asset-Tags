import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { SupportForm } from "@/components/public/support-form";
import { PublicFormLayout } from "@/components/public/public-form-layout";
import { UnavailableNotice } from "@/components/public/unavailable-notice";

export const dynamic = "force-dynamic";

export default async function SupportRequestPage({
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
      title="Request support"
      orgName={resolved.org.name ?? "Rental Equipment"}
      assetName={resolved.asset.asset_name}
      assetCode={resolved.asset.asset_code}
      poweredByLabel={resolved.org.powered_by_label}
    >
      <SupportForm shortCode={shortCode} />
    </PublicFormLayout>
  );
}
