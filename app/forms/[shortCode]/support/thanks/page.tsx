import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { resolveSupportContact } from "@/lib/public/equipment";
import { formatSubmissionReference } from "@/lib/public/reference";
import { FormThanks } from "@/components/public/form-thanks";

export const dynamic = "force-dynamic";

export default async function SupportThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ shortCode: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shortCode } = await params;
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? sp.ref : undefined;
  const supabase = createPublicClient();
  const resolved = await resolvePublicEquipment(supabase, shortCode);

  return (
    <FormThanks
      shortCode={shortCode}
      orgName={resolved?.org.name ?? null}
      title="Support request received"
      reference={formatSubmissionReference(ref)}
      detail={
        resolved ? `${resolved.asset.asset_name} · ${resolved.asset.asset_code}` : null
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
