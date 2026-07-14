import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { isLikelyUuid } from "@/lib/rentals/evidence";
import {
  createEvidenceQueryClient,
  getRentalSessionEvidence,
  type SubRow,
} from "@/lib/rentals/session-evidence";
import type { ReactNode } from "react";

import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "@/lib/ui/status";
import { RelativeTime } from "@/components/relative-time";
import { PrintEvidenceButton } from "@/components/print-evidence-button";
import { EvidencePhotoGallery } from "@/components/submissions/evidence-photo-gallery";
import { submissionReference } from "@/lib/submissions/inbox";
import { returnChecklistFlags } from "@/lib/submissions/returns";
import {
  ReturnInspectionSummary,
  isReturnInspectionV2,
} from "@/components/submissions/return-inspection-summary";
import { buildSessionComparison, photoSlotsBySource } from "@/lib/inspections/session-comparison";
import { galleryBySource, galleryPhotoCount } from "@/lib/inspections/photo-gallery";
import type { ReturnInspectionData } from "@/lib/inspections/types";

export const dynamic = "force-dynamic";

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
    <details data-evidence-section className="group rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{title}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {tone ? <Badge tone={tone}>{meta}</Badge> : <span>{meta}</span>}
          <span aria-hidden className="text-xs transition-transform group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t px-4 py-4 text-sm">{children}</div>
    </details>
  );
}

export default async function RentalEvidencePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await requireOrgId();
  const { sessionId } = await params;
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
  const { session, asset, submissions: subs } = evidence;

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

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {session.asset_id ? (
            <Link
              href={`/dashboard/assets/${session.asset_id}/timeline`}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              ← Asset timeline
            </Link>
          ) : (
            <span />
          )}
          <PrintEvidenceButton label="Print evidence" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Rental session condition</h1>
          <Badge tone={session.status === "active" ? "info" : "neutral"}>
            {session.status === "active" ? "Active" : "Returned"}
          </Badge>
        </div>
        {asset ? (
          <div className="flex flex-col items-start gap-1.5">
            <AssetTagChip code={asset.asset_code} />
            <span className="font-medium">{asset.asset_name}</span>
          </div>
        ) : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <dt>Reference</dt>
          <dd className="font-mono text-foreground">{sessionRef}</dd>
          {session.renter_label || session.rental_reference ? (
            <>
              <dt>Renter</dt>
              <dd className="text-foreground">
                {[session.renter_label, session.rental_reference].filter(Boolean).join(" · ")}
              </dd>
            </>
          ) : null}
          <dt>Rented</dt>
          <dd className="text-foreground">
            <RelativeTime value={session.started_at} />
          </dd>
          {session.returned_at ? (
            <>
              <dt>Returned</dt>
              <dd className="text-foreground">
                <RelativeTime value={session.returned_at} />
              </dd>
            </>
          ) : null}
        </dl>
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
            The staff return inspection has not been completed yet.
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
      <EvidenceDisclosure title="Outbound baseline" meta={outbound ? "Recorded" : "Not recorded"}>
        <EvidenceBody
          row={outbound}
          empty="No outbound baseline recorded for this rental."
          signedByPath={signedByPath}
        />
      </EvidenceDisclosure>

      {/* 3 · Renter return report(s) */}
      <EvidenceDisclosure
        title="Renter return report"
        meta={renterReports.length === 0 ? "No renter report" : `${renterReports.length} report${renterReports.length === 1 ? "" : "s"}`}
      >
        {renterReports.length === 0 ? (
          <p className="text-muted-foreground">No renter return report for this rental.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {renterReports.map((r) => (
              <EvidenceBody
                key={r.id}
                row={r}
                empty="Renter report has no structured data."
                signedByPath={signedByPath}
              />
            ))}
          </div>
        )}
      </EvidenceDisclosure>

      {/* 4 · Staff return inspection */}
      <EvidenceDisclosure title="Staff return inspection" meta={staffMeta} tone={staffTone}>
        <EvidenceBody
          row={staff}
          empty="The staff return inspection has not been completed yet."
          signedByPath={signedByPath}
        />
      </EvidenceDisclosure>

      {/* 5 · Photos by source — one deduped, responsive tiled gallery. */}
      <EvidenceDisclosure
        title="Photos by source"
        meta={`${photoCount} photo${photoCount === 1 ? "" : "s"}`}
      >
        <EvidencePhotoGallery sources={gallerySources} signedByPath={signedByPath} />
      </EvidenceDisclosure>
    </div>
  );
}

/** One evidence source's body inside a disclosure: submission link + structured summary (photos hidden — the
 *  gallery renders them once). Empty state text when the source is absent. */
function EvidenceBody({
  row,
  empty,
  signedByPath,
}: {
  row: SubRow | null;
  empty: string;
  signedByPath: Map<string, string | null>;
}) {
  const data = row ? asData(row.submission_data_json) : null;
  return (
    <div className="flex flex-col gap-2">
      {row ? (
        <Link
          href={`/dashboard/submissions/${row.id}`}
          className="text-xs underline-offset-4 hover:underline"
        >
          {submissionReference(row.id, row.created_at)} ·{" "}
          {row.submitted_by_name ?? "—"} · <RelativeTime value={row.created_at} />
        </Link>
      ) : null}
      {data ? (
        <ReturnInspectionSummary data={data} signedByPath={signedByPath} hidePhotos />
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
