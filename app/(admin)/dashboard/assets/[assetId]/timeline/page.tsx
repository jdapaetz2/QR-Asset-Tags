import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { buildAssetTimeline, type TimelineEvent } from "@/lib/timeline/timeline";
import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { RelativeTime } from "@/components/relative-time";
import { SubmissionBadges } from "@/components/submissions/submission-badges";
import { returnChecklistFlags } from "@/lib/submissions/returns";
import { buildSessionEvidenceHref } from "@/lib/rentals/evidence";

// Read-only, auth-scoped per request; never cache.
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<TimelineEvent["kind"], string> = {
  created: "Created",
  submission: "Submission",
  acknowledgement: "Acknowledgement",
  tag_request: "Tag request",
  rental_started: "Rental",
  rental_ended: "Rental",
  archived: "Archived",
};

export default async function AssetTimelinePage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  await requireOrgId();
  const { assetId } = await params;

  const supabase = await createClient();

  // RLS-scoped: a row from another org isn't returned → 404. Archived assets are
  // still readable here (assets_rw has no archived filter), so admins keep history.
  const { data: asset } = await supabase
    .from("assets")
    .select("asset_code, asset_name, created_at, archived_at")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) notFound();

  // All reads are RLS-scoped to the caller's org and filtered to this asset.
  const [{ data: submissions }, { data: acks }, { data: tagAssets }, { data: rentals }] =
    await Promise.all([
      supabase
        .from("form_submissions")
        .select(
          "id, form_type, status, created_at, submitted_by_name, submission_origin, submission_data_json, media_urls"
        )
        .eq("asset_id", assetId),
      supabase
        .from("asset_acknowledgements")
        .select("id, name, email, phone, statement, created_at")
        .eq("asset_id", assetId),
      supabase
        .from("tag_request_assets")
        .select("tag_request:tag_requests(id, status, created_at)")
        .eq("asset_id", assetId),
      supabase
        .from("asset_rental_sessions")
        .select("id, status, rental_reference, renter_label, started_at, returned_at")
        .eq("asset_id", assetId),
    ]);

  // The embedded to-one relation may be typed as an array; normalize either shape.
  const tagRequests = ((tagAssets ?? []) as unknown as {
    tag_request:
      | { id: string; status: string; created_at: string }
      | { id: string; status: string; created_at: string }[]
      | null;
  }[])
    .map((r) => (Array.isArray(r.tag_request) ? r.tag_request[0] : r.tag_request))
    .filter((t): t is { id: string; status: string; created_at: string } => t != null);

  const events = buildAssetTimeline({
    assetCreatedAt: asset.created_at ?? null,
    archivedAt: asset.archived_at ?? null,
    submissions: ((submissions ?? []) as {
      id: string;
      form_type: string;
      status: string;
      created_at: string;
      submitted_by_name: string | null;
      submission_origin: string | null;
      submission_data_json: unknown;
      media_urls: unknown;
    }[]).map((s) => {
      const flags =
        s.form_type === "return_checklist"
          ? returnChecklistFlags(s.submission_data_json)
          : { damage: false, missing: false };
      return {
        id: s.id,
        form_type: s.form_type,
        status: s.status,
        created_at: s.created_at,
        submitted_by_name: s.submitted_by_name,
        attachmentCount: Array.isArray(s.media_urls) ? s.media_urls.length : 0,
        origin: s.submission_origin,
        damage: s.form_type === "damage_report" ? true : flags.damage,
        missing: flags.missing,
      };
    }),
    acknowledgements: (acks ?? []) as {
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      statement: string | null;
      created_at: string;
    }[],
    tagRequests,
    rentalSessions: (rentals ?? []) as {
      id: string;
      status: string;
      rental_reference: string | null;
      renter_label: string | null;
      started_at: string;
      returned_at: string | null;
    }[],
  });

  // Most recent rental session (by start) → the session evidence view link.
  const latestSessionId =
    ((rentals ?? []) as { id: string; started_at: string }[])
      .slice()
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href={`/dashboard/assets/${assetId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {asset.asset_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Timeline</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <AssetTagChip code={asset.asset_code} />
          <span>
            {asset.asset_name} · {events.length} event{events.length === 1 ? "" : "s"}
          </span>
          {latestSessionId ? (
            <Link
              href={buildSessionEvidenceHref(latestSessionId)}
              className="rounded-md border px-2 py-0.5 text-xs text-foreground underline-offset-4 hover:bg-accent"
            >
              Latest rental evidence →
            </Link>
          ) : null}
        </div>
      </section>

      {events.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No activity recorded for this asset yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((e, i) => (
            <li
              key={`${e.kind}-${e.at}-${i}`}
              className="rounded-lg border bg-card p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                {e.kind === "submission" && e.formType ? (
                  // Submission events read exactly like an inbox row (shared SubmissionBadges).
                  <SubmissionBadges
                    formType={e.formType}
                    origin={e.origin ?? null}
                    status={e.status ?? ""}
                    damage={e.damage}
                    missing={e.missing}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {KIND_LABELS[e.kind]}
                    </span>
                    <span className="text-sm font-medium">{e.title}</span>
                    {e.badge ? (
                      <span className="rounded-full border px-2 py-0.5 text-xs">
                        {e.badge}
                      </span>
                    ) : null}
                  </div>
                )}
                <span className="text-xs text-muted-foreground">
                  <RelativeTime value={e.at} />
                </span>
              </div>

              {e.reference || e.detail || e.contact || e.attachmentCount || e.href ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {e.reference ? (
                    <span className="font-mono text-xs text-muted-foreground/80">{e.reference}</span>
                  ) : null}
                  {e.detail ? <span>{e.detail}</span> : null}
                  {e.contact ? <span>{e.contact}</span> : null}
                  {e.attachmentCount ? (
                    <span>
                      📎 {e.attachmentCount} attachment
                      {e.attachmentCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {e.href ? (
                    <Link
                      href={e.href}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      Open details
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {e.statement ? (
                <p className="mt-2 border-l-2 pl-3 text-sm italic text-muted-foreground">
                  “{e.statement}”
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
