import Link from "next/link";
import type { ReactNode } from "react";

import { AssetCodeChip } from "@/components/ui/asset-code-chip";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { BadgeTone } from "@/lib/ui/status";
import { RelativeTime } from "@/components/relative-time";
import { EvidencePrintHeader } from "@/components/submissions/evidence-print-header";
import { SessionAcknowledgements } from "@/components/submissions/session-acknowledgements";
import { EvidencePhotoGallery } from "@/components/submissions/evidence-photo-gallery";
import { PhotoTileGrid } from "@/components/submissions/photo-tile-grid";
import {
  ReturnInspectionSummary,
  isReturnInspectionV2,
} from "@/components/submissions/return-inspection-summary";
import { submissionReference } from "@/lib/submissions/inbox";
import { returnChecklistFlags } from "@/lib/submissions/returns";
import type { summarizeAcknowledgements } from "@/lib/acknowledgements/summary";
import type { AssetRow, SessionRow, SubRow } from "@/lib/rentals/session-evidence";
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

/**
 * Shared, presentational rental-session evidence RECORD (Wave 3N.3). The single source of the evidence
 * content — print masthead, identity band, summary card, acknowledgements, and the five collapsed
 * disclosures — rendered identically by the admin dashboard page and the thin staff wrapper. Each surface
 * supplies its own chrome (back/print) and its own `submissionHref` so the per-source "Open submission"
 * link routes to the correct surface (admin → /dashboard/submissions/:id; staff → /staff/t/:code/submissions/:id).
 * Pure data-in / JSX-out: no data loading, no signing — the caller passes the already-signed `signedByPath`.
 */

const asData = (json: unknown): ReturnInspectionData | null =>
  isReturnInspectionV2(json) ? json : null;

type AckSummary = ReturnType<typeof summarizeAcknowledgements>;

export function SessionEvidenceRecord({
  session,
  asset,
  subs,
  ackSummary,
  signedByPath,
  submissionHref,
}: {
  session: SessionRow;
  asset: AssetRow | null;
  subs: SubRow[];
  ackSummary: AckSummary;
  signedByPath: Map<string, string | null>;
  /** Surface-specific route to a submission's own detail view. */
  submissionHref: (submissionId: string) => string;
}) {
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

  const photoGroups = photoSlotsBySource({
    outbound: asData(outbound?.submission_data_json),
    staff: asData(staff?.submission_data_json),
    renterReports: renterReports.map((r) => ({ submission_data_json: r.submission_data_json })),
  });

  const sessionRef = submissionReference(session.id, session.started_at).replace("SUB", "RNT");
  const statusLabel = session.status === "active" ? "Active" : "Returned";

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

  const outboundPhotoCount = tilesForSource(photoGroups, "outbound").length;
  const renterPhotoCount = tilesForSource(photoGroups, "renter").length;
  const staffPhotoCount = tilesForSource(photoGroups, "staff").length;
  const withPhotos = (label: string, n: number) => `${label} · ${n} photo${n === 1 ? "" : "s"}`;

  return (
    <>
      {/* Print-only Mulemark masthead — hidden on screen, self-identifies the printed record. */}
      <EvidencePrintHeader
        assetCode={asset?.asset_code ?? null}
        assetName={asset?.asset_name ?? null}
        sessionRef={sessionRef}
        status={statusLabel}
      />

      {/* Identity band. */}
      <div className="flex flex-col gap-1">
        <Eyebrow>Rental session · {sessionRef}</Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-iron-950">
            Rental session condition
          </h1>
          <Badge tone={session.status === "active" ? "info" : "neutral"}>{statusLabel}</Badge>
        </div>
      </div>

      {/* Top summary — two columns on desktop, stacked on mobile (acknowledgement second). */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[10px] border border-iron-200 border-l-2 border-l-brass-500 bg-card p-4">
          <Eyebrow>Rental session</Eyebrow>
          {asset ? (
            <div className="flex flex-col items-start gap-1.5">
              <AssetCodeChip code={asset.asset_code} />
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
          submissionHref={submissionHref}
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
                submissionHref={submissionHref}
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
          submissionHref={submissionHref}
        />
      </EvidenceDisclosure>

      {/* 5 · Photos by source — the deduped aggregate gallery (hidden in print to avoid duplicate pages). */}
      <div data-evidence-aggregate>
        <EvidenceDisclosure
          title="Photos by source"
          meta={`${photoCount} photo${photoCount === 1 ? "" : "s"}`}
        >
          <EvidencePhotoGallery sources={gallerySources} signedByPath={signedByPath} />
        </EvidenceDisclosure>
      </div>
    </>
  );
}

/** A collapsed evidence section: a native <details> disclosure with a ≥44px summary carrying short context. */
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

/** One evidence source's body: submission link + structured summary + that inspection's own deduped photo grid. */
function EvidenceBody({
  row,
  empty,
  source,
  photoGroups,
  signedByPath,
  submissionHref,
}: {
  row: SubRow | null;
  empty: string;
  source: PhotoSource;
  photoGroups: PhotoSlotGroup[];
  signedByPath: Map<string, string | null>;
  submissionHref: (submissionId: string) => string;
}) {
  const data = row ? asData(row.submission_data_json) : null;
  const tiles = data ? tilesForSource(photoGroups, source) : [];
  return (
    <div className="flex flex-col gap-3">
      {row ? (
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
            href={submissionHref(row.id)}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-iron-200 px-3 text-xs font-medium text-iron-950 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 print:hidden"
          >
            Open submission <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
      {data ? (
        <>
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
