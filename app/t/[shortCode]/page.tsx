import { createPublicClient } from "@/lib/supabase/public";
import { recordScan } from "@/lib/scan/record";
import { time } from "@/lib/diagnostics/server-timing";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { getPublicDocuments } from "@/lib/public/documents-server";
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

  // Phase C5 deploy A — instrumentation only, no behaviour change. C0 measured this route at 294 ms
  // above the dynamic floor and isolated only `scan.record` (71-104 ms) inside it. These two wrappers
  // split the rest, and deploy B keeps the SAME instrument so the change is attributable rather than
  // compared against a differently-measured baseline.
  const resolved = await time("scan", "page.primary_queries", () =>
    resolvePublicEquipment(supabase, shortCode)
  );
  if (!resolved) return <UnavailableNotice />;

  // Best-effort scan log (never breaks rendering). Awaited here — C0 measured 294 ms of server time
  // above the dynamic floor on this route and could not isolate this write's share; the timing wrapper
  // (inert unless MULEMARK_DIAGNOSTIC_TIMING=1) is what will separate it. Behaviour is unchanged.
  await time("scan", "scan.record", () =>
    recordScan(supabase, {
      qrLinkId: resolved.qrLinkId,
      assetId: resolved.assetId,
      organizationId: resolved.organizationId,
    })
  );

  // Still SERIAL on purpose in deploy A. These two reads are independent, but parallelizing them is
  // the deploy-B change; measuring them serially first is what makes that change attributable.
  const [documents, profile] = await time("scan", "page.secondary_queries", async () => {
    // Public documents (RLS restricts to public docs of this public asset).
    const docs = await getPublicDocuments(supabase, resolved.assetId);
    // Show the staff workflow link ONLY to an authenticated member of this asset's organization.
    // getProfile() uses the cookie-scoped client; anon visitors resolve to null (no link, no leak).
    const prof = await getProfile();
    return [docs, prof] as const;
  });
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
