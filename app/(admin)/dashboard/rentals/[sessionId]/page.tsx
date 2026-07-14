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
import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/relative-time";
import { PrintButton } from "@/components/print-button";
import { submissionReference } from "@/lib/submissions/inbox";
import {
  ReturnInspectionSummary,
  isReturnInspectionV2,
} from "@/components/submissions/return-inspection-summary";
import {
  buildSessionComparison,
  photoSlotsBySource,
  type PhotoSource,
} from "@/lib/inspections/session-comparison";
import type { ReturnInspectionData } from "@/lib/inspections/types";

export const dynamic = "force-dynamic";

const SUBMISSIONS_BUCKET = "submissions";

const asData = (json: unknown): ReturnInspectionData | null =>
  isReturnInspectionV2(json) ? json : null;

const SOURCE_LABEL: Record<PhotoSource, string> = {
  outbound: "Outbound baseline",
  renter: "Renter return report",
  staff: "Staff return inspection",
};

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
          <PrintButton label="Print evidence" />
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

      {/* Differences (Part D). Never asserts causation — records differences + flags review only. */}
      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-3 font-medium">Differences</h2>
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
      </section>

      {/* The three sources, in order. */}
      <EvidenceSource
        title="1 · Outbound baseline"
        empty="No outbound baseline recorded for this rental."
        row={outbound}
        signedByPath={signedByPath}
      />
      {renterReports.length === 0 ? (
        <SourceEmpty title="2 · Renter return report" text="No renter return report for this rental." />
      ) : (
        renterReports.map((r, i) => (
          <EvidenceSource
            key={r.id}
            title={`2 · Renter return report${renterReports.length > 1 ? ` (${i + 1})` : ""}`}
            empty="Renter report has no structured data."
            row={r}
            signedByPath={signedByPath}
          />
        ))
      )}
      <EvidenceSource
        title="3 · Staff return inspection"
        empty="The staff return inspection has not been completed yet."
        row={staff}
        signedByPath={signedByPath}
      />

      {/* Photos grouped by source and slot. */}
      {photoGroups.length > 0 ? (
        <section className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="mb-3 font-medium">Photos by source</h2>
          <div className="flex flex-col gap-4">
            {photoGroups.map((g) => (
              <div key={`${g.source}-${g.slotId}`} className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{SOURCE_LABEL[g.source]}</span> · {g.label}
                </p>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {g.paths.map((path, i) => {
                    const url = signedByPath.get(path) ?? null;
                    return url ? (
                      <li key={path}>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`${SOURCE_LABEL[g.source]} ${g.label} ${i + 1}`}
                            className="aspect-square w-full rounded-md border object-cover"
                          />
                        </a>
                      </li>
                    ) : (
                      <li key={path} className="text-xs text-muted-foreground">
                        Photo unavailable
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SourceEmpty({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-lg border bg-card p-4 text-sm">
      <h2 className="mb-1 font-medium">{title}</h2>
      <p className="text-muted-foreground">{text}</p>
    </section>
  );
}

function EvidenceSource({
  title,
  empty,
  row,
  signedByPath,
}: {
  title: string;
  empty: string;
  row: SubRow | null;
  signedByPath: Map<string, string | null>;
}) {
  const data = row ? asData(row.submission_data_json) : null;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {row ? (
          <Link
            href={`/dashboard/submissions/${row.id}`}
            className="text-xs underline-offset-4 hover:underline"
          >
            {submissionReference(row.id, row.created_at)} ·{" "}
            {row.submitted_by_name ?? "—"} · <RelativeTime value={row.created_at} />
          </Link>
        ) : null}
      </div>
      {data ? (
        <ReturnInspectionSummary data={data} signedByPath={signedByPath} />
      ) : (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
