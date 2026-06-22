import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { resolveSupportContact } from "@/lib/public/equipment";
import { FormThanks } from "@/components/public/form-thanks";

export const dynamic = "force-dynamic";

export default async function SupportThanksPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = createPublicClient();
  const resolved = await resolvePublicEquipment(supabase, shortCode);

  return (
    <FormThanks
      shortCode={shortCode}
      title="Support request received"
      detail={
        resolved
          ? `${resolved.asset.asset_name} · ${resolved.asset.asset_code}`
          : null
      }
      support={
        resolved
          ? resolveSupportContact(resolved.asset, resolved.org)
          : { phone: null, email: null }
      }
      poweredByLabel={resolved?.org.powered_by_label ?? null}
    />
  );
}
