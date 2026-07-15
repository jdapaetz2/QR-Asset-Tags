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
  type SubRow,
} from "@/lib/rentals/session-evidence";
import type { ReactNode } from "react";

import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { BadgeTone } from "@/lib/ui/status";
import { RelativeTime } from "@/components/relative-time";
import { PrintEvidenceButton } from "@/components/print-evidence-button";
import { EvidencePrintHeader } from "@/components/submissions/evidence-print-header";
import { SessionAcknowledgements } from "@/components/submissions/session-acknowledgements";
import { EvidencePhotoGallery } from "@/components/submissions/evidence-photo-gallery";
import { PhotoTileGrid } from "@/components/submissions/photo-tile-grid";
import { submissionReference } from "@/lib/submissions/inbox";
import { returnChecklistFlags } from "@/lib/submissions/returns";
import { summarizeAcknowledgements } from "@/lib/acknowledgements/summary";
import { PLATFORM_NAME } from "@/lib/constants";
import {
  ReturnInspectionSummary,
  isReturnInspectionV2,
} from "@/components/submissions/return-inspection-summary";
import {
  buildSessionComparison,
  photoSlotsBySource,
  type PhotoSlotGroup,
  type PhotoSource,
} from "@/lib/inspections/session-comparison";
import {
  galleryBySource,
  galleryPhotoCount,
  tilesForSource,
} from "@/lib/inspections/photo-gallery";
import type { ReturnInspectionData } from "@/lib/inspections/types";

export const dynamic = "force-dynamic";

// Route title override (Phase 3C.7, Part G). The root layout sets the document <title> to the
// internal PRODUCT_NAME, which the browser stamps into the print header. This static title
// (no extra query) makes the printed/exported record read as the MuleMark platform brand instead.
export const metadata: Metadata = {
  title: `Rental session evidence · ${PLATFORM_NAME}`,
};

const SUBMISSIONS_BUCKET = "submissions";

const asData = (json: unknown): ReturnInspectionData | null =>
  isReturnInspectionV2(json) ? json : null;

/** A collapsed evidence section (Phase 3C.5): a native <details> disclosure with a ≥44px summary that carries a
 *  short context (count / status) so the record is scannable without expanding. Print reveals all of them. */
function EvidenceDisclosure({
  title,
  meta,
  tone,
  children,
}: {
  title: string;
  meta: string;
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <details data-evidence-section className="group rounded-[10px] border border-iron-200 bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-4 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-iron-950">{title}</span>
        <span className="flex items-center gap-2 text-sm text-iron-600">
          {tone ? <Badge tone={tone}>{meta}</Badge> : <span>{meta}</span>}
          <span
            aria-hidden
            className="text-xs text-iron-600 transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-iron-200 px-4 py-4 text-sm">{children}</div>
    </details>
  );
}

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

  // Load the session by id with NO embedded relation, then its asset + submissions SEPARATELY. The old embedded
  // `asset:assets(...)` select was ambiguous (two FKs between the tables → PGRST201) and its swallowed error
  // 404'd every session. The loader surfaces real DB errors (throws + logs) and returns null only for a genuinely
  // missing / cross-org-hidden (RLS) session. Missing related records render empty states, never a 404.
  const evidence = await getRentalSessionEvidence(
    createEvidenceQueryClient(supabase),
    sessionId
  );
  if (!evidence) notFound();
  const { session, asset, submissions: subs, acknowledgements } = evidence;
  const ackSummary = summarizeAcknowledgements(acknowledgements);

  const outbound = subs.find((s) => s.form_type === "pre_use_inspection") ?? null;
  const staff =
    subs.find((s) => s.form_type === "return_checklist" && s.submission_origin === "staff") ?? null;
  const renterReports = subs.filter(
    (s) => s.form_type === "return_checklist" && s.submission_origin === "public"
  );

  const comparison = buildSessionComparison({
    outbound: asData(outbound?.submission_data_json),
    staff: asData(staff?.submission_data_json),
    renterReports: renterReports.map((r) => ({ submission_data_json: r.submission_data_json })),
  });

  // Sign every media path across all session submissions once → a shared path→url map (private bucket).
  const allPaths = subs.flatMap((s) =>
    Array.isArray(s.media_urls) ? (s.media_urls as string[]) : []
  );
  const signedByPath = new Map<string, string | null>();
  await Promise.all(
    allPaths.map(async (path) => {
      const { data: signed } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .createSignedUrl(path, 3600);
      signedByPath.set(path, signed?.signedUrl ?? null);
    })
  );

  const photoGroups = photoSlotsBySource({
    outbound: asData(outbound?.submission_data_json),
    staff: asData(staff?.submission_data_json),
    renterReports: renterReports.map((r) => ({ submission_data_json: r.submission_data_json })),
  });

  const sessionRef = submissionReference(session.id, session.started_at).replace("SUB", "RNT");
  const statusLabel = session.status === "active" ? "Active" : "Returned";

  // Disclosure summaries (Phase 3C.5) — scannable context without expanding.
  const gallerySources = galleryBySource(photoGroups);
  const photoCount = galleryPhotoCount(gallerySources);
  const staffFlags = staff ? returnChecklistFlags(staff.submission_data_json) : null;
  const diffMeta =
    comparison.followUps.length > 0
      ? `${comparison.followUps.length} open follow-up item${comparison.followUps.length === 1 ? "" : "s"}`
      : "No recorded differences";
  const staffMeta = !staff
    ? "Not completed"
    : staffFlags?.damage
      ? "Damage reported"
      : staffFlags?.missing
        ? "Accessories missing"
        : "No issues reported";
  const staffTone: BadgeTone = !staff
    ? "neutral"
    : staffFlags?.damage
      ? "danger"
      : staffFlags?.missing
        ? "warning"
        : "success";

  // Per-inspection photo counts (Phase 3C.6) — surfaced in the disclosure summary + each inspection's own grid.
  const outboundPhotoCount = tilesForSource(photoGroups, "outbound").length;
  const renterPhotoCount = tilesForSource(photoGroups, "renter").length;
  const staffPhotoCount = tilesForSource(photoGroups, "staff").length;
  const withPhotos = (label: string, n: number) => `${label} · ${n} photo${n === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Print-only MuleMark masthead (Phase 3C.7) — hidden on screen, self-identifies the printed record. */}
      <EvidencePrintHeader
        assetCode={asset?.asset_code ?? null}
        assetName={asset?.asset_name ?? null}
        sessionRef={sessionRef}
        status={statusLabel}
      />

      {/* Branded page header (Phase 3C.7) — MuleMark eyebrow + title + status; interactive controls hidden in
          print. The back link and Print button never belong on the printed record. */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          {/* Explicit navigation out of the evidence record (Wave 3N.2) — never rely on browser Back. Back to
              Rentals preserves the originating filters; Asset detail + timeline are always offered when linked. */}
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
        <div className="flex flex-col gap-1">
          <Eyebrow>Rental session · {sessionRef}</Eyebrow>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-iron-950">
              Rental session condition
            </h1>
            <Badge tone={session.status === "active" ? "info" : "neutral"}>{statusLabel}</Badge>
          </div>
        </div>
      </header>

      {/* Top summary (Phase 3C.7, Part D) — two columns on desktop, stacked on mobile (acknowledgement second).
          The left card carries the one brass accent for this screen (hierarchy law: spend boldness once). */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[10px] border border-iron-200 border-l-2 border-l-brass-500 bg-card p-4">
          <Eyebrow>Rental session</Eyebrow>
          {asset ? (
            <div className="flex flex-col items-start gap-1.5">
              <AssetTagChip code={asset.asset_code} />
              <span className="font-medium text-iron-950">{asset.asset_name}</span>
            </div>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm text-iron-600">
            <dt>Status</dt>
            <dd className="text-iron-950">{statusLabel}</dd>
            <dt>Reference</dt>
            <dd className="font-mono text-brass-600">{sessionRef}</dd>
            {session.renter_label || session.rental_reference ? (
              <>
                <dt>Renter</dt>
                <dd className="text-iron-950">
                  {[session.renter_label, session.rental_reference].filter(Boolean).join(" · ")}
                </dd>
              </>
            ) : null}
            <dt>Rented</dt>
            <dd className="text-iron-950">
              <RelativeTime value={session.started_at} />
            </dd>
            {session.returned_at ? (
              <>
                <dt>Returned</dt>
                <dd className="text-iron-950">
                  <RelativeTime value={session.returned_at} />
                </dd>
              </>
            ) : null}
          </dl>
        </div>

        <SessionAcknowledgements summary={ackSummary} />
      </section>

      {/* All evidence groups are collapsed disclosures (Phase 3C.5) — the summary above stays visible; each
          section shows scannable context and expands on demand. Print reveals every section. */}

      {/* 1 · Differences. Never asserts causation — records differences + flags review only. */}
      <EvidenceDisclosure
        title="Differences"
        meta={diffMeta}
        tone={comparison.followUps.length > 0 ? "warning" : undefined}
      >
        {!comparison.hasOutbound ? (
          <p className="text-muted-foreground">
            No outbound baseline recorded — no baseline comparison for this rental.
          </p>
        ) : !comparison.hasStaff ? (
          <p className="text-muted-foreground">
            The staff return checklist has not been completed yet.
          </p>
        ) : comparison.rows.length === 0 ? (
          <p className="text-muted-foreground">No recorded value differences.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Item</th>
                  <th className="py-1.5 pr-3 font-medium">Outbound</th>
                  <th className="py-1.5 pr-3 font-medium">Renter</th>
                  <th className="py-1.5 pr-3 font-medium">Staff</th>
                  <th className="py-1.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row.fieldId} className={row.changed ? "border-b bg-amber-500/[0.06]" : "border-b"}>
                    <td className="py-1.5 pr-3">{row.label}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.outbound ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.renter ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      {row.staff ?? "—"}
                      {row.delta ? <span className="ml-1 text-xs text-muted-foreground">({row.delta})</span> : null}
                    </td>
                    <td className="py-1.5">
                      {row.note ? <Badge tone="warning">{row.note}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {comparison.condition.note ? (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <span className="font-medium">Condition:</span> {comparison.condition.note}
          </p>
        ) : null}

        {comparison.followUps.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Open follow-up items
            </p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {comparison.followUps.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </EvidenceDisclosure>

      {/* 2 · Outbound baseline */}
      <EvidenceDisclosure
        title="Outbound baseline"
        meta={outbound ? withPhotos("Recorded", outboundPhotoCount) : "Not recorded"}
      >
        <EvidenceBody
          row={outbound}
          empty="No outbound baseline recorded for this rental."
          source="outbound"
          photoGroups={photoGroups}
          signedByPath={signedByPath}
        />
      </EvidenceDisclosure>

      {/* 3 · Renter return checklist(s) */}
      <EvidenceDisclosure
        title="Renter return checklist"
        meta={
          renterReports.length === 0
            ? "No renter report"
            : withPhotos(
                `${renterReports.length} report${renterReports.length === 1 ? "" : "s"}`,
                renterPhotoCount
              )
        }
      >
        {renterReports.length === 0 ? (
          <p className="text-muted-foreground">No renter return checklist for this rental.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {renterReports.map((r) => (
              <EvidenceBody
                key={r.id}
                row={r}
                empty="Renter report has no structured data."
                source="renter"
                photoGroups={photoGroups}
                signedByPath={signedByPath}
              />
            ))}
          </div>
        )}
      </EvidenceDisclosure>

      {/* 4 · Staff return checklist */}
      <EvidenceDisclosure
        title="Staff return checklist"
        meta={staff ? withPhotos(staffMeta, staffPhotoCount) : staffMeta}
        tone={staffTone}
      >
        <EvidenceBody
          row={staff}
          empty="The staff return checklist has not been completed yet."
          source="staff"
          photoGroups={photoGroups}
          signedByPath={signedByPath}
        />
      </EvidenceDisclosure>

      {/* 5 · Photos by source — the deduped aggregate gallery (hidden in print to avoid duplicate pages, since
          each inspection above already prints its own photos). */}
      <div data-evidence-aggregate>
        <EvidenceDisclosure
          title="Photos by source"
          meta={`${photoCount} photo${photoCount === 1 ? "" : "s"}`}
        >
          <EvidencePhotoGallery sources={gallerySources} signedByPath={signedByPath} />
        </EvidenceDisclosure>
      </div>
    </div>
  );
}

/** One evidence source's body inside a disclosure: submission link + structured summary + THAT inspection's own
 *  deduped photo grid (Phase 3C.6). Photos reuse the page's single `signedByPath`. Empty state when absent. */
function EvidenceBody({
  row,
  empty,
  source,
  photoGroups,
  signedByPath,
}: {
  row: SubRow | null;
  empty: string;
  source: PhotoSource;
  photoGroups: PhotoSlotGroup[];
  signedByPath: Map<string, string | null>;
}) {
  const data = row ? asData(row.submission_data_json) : null;
  const tiles = data ? tilesForSource(photoGroups, source) : [];
  return (
    <div className="flex flex-col gap-3">
      {row ? (
        // Submission navigation (Phase 3C.7, Part B). The reference is a non-clickable mono chip (prints as
        // text); a separate explicit open action (below) carries the navigation, so the reference is no
        // longer an ambiguous inline link. The action is hidden in print (the printed record is self-contained).
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-iron-600">
              Reference
            </span>
            <span className="inline-flex w-fit items-center rounded border border-brass-500/30 bg-bone-50 px-1.5 py-0.5 font-mono text-xs text-iron-950">
              {submissionReference(row.id, row.created_at)}
            </span>
            <span className="text-xs text-iron-600">
              {row.submitted_by_name ?? "—"} · <RelativeTime value={row.created_at} />
            </span>
          </div>
          <Link
            href={`/dashboard/submissions/${row.id}`}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-iron-200 px-3 text-xs font-medium text-iron-950 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 print:hidden"
          >
            Open submission <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
      {data ? (
        <>
          {/* Structured answers (photos hidden here — rendered as their own grid just below). */}
          <ReturnInspectionSummary data={data} signedByPath={signedByPath} hidePhotos />
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos</p>
            <PhotoTileGrid
              tiles={tiles}
              signedByPath={signedByPath}
              emptyText="No photos in this inspection."
            />
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
