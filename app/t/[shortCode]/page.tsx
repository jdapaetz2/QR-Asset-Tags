import { createPublicClient } from "@/lib/supabase/public";
import { recordScan } from "@/lib/scan/record";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { getPublicDocuments } from "@/lib/public/documents";
import { getProfile } from "@/lib/auth/session";
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

  // Public documents (RLS restricts to public docs of this public asset).
  const documents = await getPublicDocuments(supabase, resolved.assetId);

  // Show the staff workflow link ONLY to an authenticated member of this asset's organization.
  // getProfile() uses the cookie-scoped client; anon visitors resolve to null (no link, no leak).
  const profile = await getProfile();
  const isStaffViewer = !!profile && profile.organization_id === resolved.organizationId;

  return (
    <PublicEquipmentPage
      shortCode={shortCode}
      asset={resolved.asset}
      assetId={resolved.assetId}
      activeRentalSessionId={resolved.activeRentalSessionId}
      page={resolved.page}
      org={resolved.org}
      documents={documents}
      isStaffViewer={isStaffViewer}
    />
  );
}
