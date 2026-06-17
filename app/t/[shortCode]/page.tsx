import { createPublicClient } from "@/lib/supabase/public";
import { recordScan } from "@/lib/scan/record";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { PublicEquipmentPage } from "@/components/public/public-equipment-page";
import { UnavailableNotice } from "@/components/public/unavailable-notice";

// Public, no-login page. Dynamic because each visit logs a scan and reads headers.
export const dynamic = "force-dynamic";

export default async function PublicScanPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = createPublicClient();

  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) return <UnavailableNotice />;

  // Best-effort scan log (never breaks rendering).
  await recordScan(supabase, {
    qrLinkId: resolved.qrLinkId,
    assetId: resolved.assetId,
    organizationId: resolved.organizationId,
  });

  return (
    <PublicEquipmentPage
      shortCode={shortCode}
      asset={resolved.asset}
      page={resolved.page}
      org={resolved.org}
    />
  );
}
