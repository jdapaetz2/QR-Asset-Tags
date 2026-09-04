import { headers } from "next/headers";

import { createPublicClient } from "@/lib/supabase/public";
import { serverEnv } from "@/lib/env";
import { readScanRequestMeta } from "@/lib/scan/record";
import { scheduleScanOnce } from "@/lib/scan/schedule";
import { time } from "@/lib/diagnostics/server-timing";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { getPublicDocuments } from "@/lib/public/documents-server";
import { getProfile } from "@/lib/auth/session";
import { PublicEquipmentPage } from "@/components/public/public-equipment-page";
import { UnavailableNotice } from "@/components/public/unavailable-notice";

// Public, no-login page. Dynamic because each visit logs a scan and reads headers. `after()` is not a
// request-time API and does not change that either way — this route stays dynamic, never static.
export const dynamic = "force-dynamic";

export default async function PublicScanPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = createPublicClient();

  // ESSENTIAL AND FIRST. Public eligibility decides what may be rendered at all, so it stays ahead of
  // the response and ahead of any scheduling: a disabled, private, archived or missing tag returns the
  // same soft-200 unavailable page and records nothing.
  const resolved = await time("scan", "page.primary_queries", () =>
    resolvePublicEquipment(supabase, shortCode)
  );
  if (!resolved) return <UnavailableNotice />;

  // Read the request data the scan row needs WHILE RENDERING. A Server Component may not call
  // headers() inside an `after` callback, and the IP is hashed here so only the digest — never the
  // raw address — is carried into work that outlives the response.
  const scanMeta = readScanRequestMeta(await headers(), serverEnv.scanIpHashSalt);

  // Best-effort scan log, now scheduled to run AFTER the response instead of delaying it (Phase C5).
  // C0 measured this write at 71-104 ms on the product's most latency-sensitive route. Exactly one
  // insert per request; nothing about its best-effort policy changes.
  scheduleScanOnce(
    supabase,
    {
      qrLinkId: resolved.qrLinkId,
      assetId: resolved.assetId,
      organizationId: resolved.organizationId,
    },
    scanMeta
  );

  // Independent reads, started together. Documents come from the anon client, the staff-viewer check
  // from the cookie-scoped one, and neither depends on the other.
  const [documents, profile] = await time("scan", "page.secondary_queries", () =>
    Promise.all([
      // Public documents (RLS restricts to public docs of this public asset).
      getPublicDocuments(supabase, resolved.assetId),
      // Show the staff workflow link ONLY to an authenticated member of this asset's organization.
      // getProfile() is C1's request-scoped read on the cookie-scoped client; anon visitors resolve to
      // null (no link, no leak), and no second Supabase client is created for it.
      getProfile(),
    ])
  );
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
