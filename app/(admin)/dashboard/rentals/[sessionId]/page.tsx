import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { isLikelyUuid } from "@/lib/rentals/evidence";
import { backHref } from "@/lib/nav/return-to";
import {
  createEvidenceQueryClient,
  getRentalSessionEvidence,
} from "@/lib/rentals/session-evidence";
import { collectMediaPaths, signMediaPaths } from "@/lib/submissions/media";
import { summarizeAcknowledgements } from "@/lib/acknowledgements/summary";
import { PLATFORM_NAME } from "@/lib/constants";
import { PrintEvidenceButton } from "@/components/print-evidence-button";
import { SessionEvidenceRecord } from "@/components/rentals/session-evidence-record";

export const dynamic = "force-dynamic";

// Route title override (Phase 3C.7, Part G). The root layout sets the document <title> to the
// internal PRODUCT_NAME, which the browser stamps into the print header. This static title
// (no extra query) makes the printed/exported record read as the MuleMark platform brand instead.
export const metadata: Metadata = {
  title: `Rental session evidence · ${PLATFORM_NAME}`,
};

export default async function RentalEvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await requireOrgId();
  const { sessionId } = await params;
  const { returnTo } = await searchParams;
  // Reject a malformed id up front so an obviously-bad param 404s deterministically and never reaches the DB.
  if (!isLikelyUuid(sessionId)) notFound();

  const supabase = await createClient();

  // Shared loader — returns null only for a genuinely missing / cross-org-hidden (RLS) session (→ 404).
  const evidence = await getRentalSessionEvidence(
    createEvidenceQueryClient(supabase),
    sessionId
  );
  if (!evidence) notFound();
  const { session, asset, submissions: subs, acknowledgements } = evidence;
  const ackSummary = summarizeAcknowledgements(acknowledgements);

  // Sign every media path across all session submissions once → a shared path→url map (private bucket).
  const signedByPath = await signMediaPaths(supabase, collectMediaPaths(subs));

  return (
    <div className="flex flex-col gap-6">
      {/* Admin chrome (Wave 3N.2) — explicit navigation out of the evidence record; hidden in print. */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <nav aria-label="Session navigation" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link
            href={backHref(returnTo, "/dashboard/rentals")}
            className="text-iron-600 underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Back to Rentals
          </Link>
          {session.asset_id ? (
            <>
              <Link
                href={`/dashboard/assets/${session.asset_id}`}
                className="text-iron-600 underline-offset-4 hover:text-foreground hover:underline"
              >
                Asset detail
              </Link>
              <Link
                href={`/dashboard/assets/${session.asset_id}/timeline`}
                className="text-iron-600 underline-offset-4 hover:text-foreground hover:underline"
              >
                Asset timeline
              </Link>
            </>
          ) : null}
        </nav>
        <PrintEvidenceButton label="Print evidence" />
      </div>

      <SessionEvidenceRecord
        session={session}
        asset={asset}
        subs={subs}
        ackSummary={ackSummary}
        signedByPath={signedByPath}
        submissionHref={(id) => `/dashboard/submissions/${id}`}
      />
    </div>
  );
}
