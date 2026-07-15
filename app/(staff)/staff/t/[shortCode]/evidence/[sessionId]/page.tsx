import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { isLikelyUuid } from "@/lib/rentals/evidence";
import {
  createEvidenceQueryClient,
  getRentalSessionEvidence,
} from "@/lib/rentals/session-evidence";
import { collectMediaPaths, signMediaPaths } from "@/lib/submissions/media";
import { summarizeAcknowledgements } from "@/lib/acknowledgements/summary";
import { belongsToScannedAsset } from "@/lib/staff/record-context";
import { SessionEvidenceRecord } from "@/components/rentals/session-evidence-record";
import { StaffRecordFrame } from "@/components/staff/staff-record-frame";

export const dynamic = "force-dynamic";

/**
 * Thin staff wrapper (Wave 3N.3) — the SAME rental-session evidence, rendered in the mobile staff shell with a
 * prominent "Back to staff asset" exit, so a staff member never lands in the desktop admin app. Reuses the
 * shared loader + shared `<SessionEvidenceRecord>` (no forked evidence/media/RLS logic). Cross-org is blocked
 * by RLS twice (the short-code guard + the evidence loader); the asset-id pairing check blocks a same-org
 * cross-asset combination. The per-source "Open submission" link stays inside the staff shell.
 */
export default async function StaffEvidencePage({
  params,
}: {
  params: Promise<{ shortCode: string; sessionId: string }>;
}) {
  const { shortCode, sessionId } = await params;
  const { asset } = await requireStaffAssetByShortCode(shortCode);
  if (!isLikelyUuid(sessionId)) notFound();

  const supabase = await createClient();
  const evidence = await getRentalSessionEvidence(
    createEvidenceQueryClient(supabase),
    sessionId
  );
  // Not found / cross-org (RLS) → 404; a session for a DIFFERENT asset than the scanned one → 404.
  if (!evidence || !belongsToScannedAsset(evidence.session.asset_id, asset.id)) notFound();

  const { session, asset: evidenceAsset, submissions: subs, acknowledgements } = evidence;
  const ackSummary = summarizeAcknowledgements(acknowledgements);
  const signedByPath = await signMediaPaths(supabase, collectMediaPaths(subs));

  return (
    <StaffRecordFrame
      shortCode={shortCode}
      assetId={asset.id}
      assetName={asset.asset_name}
      eyebrow="Session evidence"
      showPrint
    >
      <SessionEvidenceRecord
        session={session}
        asset={evidenceAsset}
        subs={subs}
        ackSummary={ackSummary}
        signedByPath={signedByPath}
        submissionHref={(id) => `/staff/t/${shortCode}/submissions/${id}`}
      />
    </StaffRecordFrame>
  );
}
