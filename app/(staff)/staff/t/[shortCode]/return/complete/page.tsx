import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { submissionReference } from "@/lib/submissions/inbox";
import { returnChecklistFlags } from "@/lib/submissions/returns";
import { buildSessionEvidenceHref } from "@/lib/rentals/evidence";

export const dynamic = "force-dynamic";

/** Condition headline derived from the submission flags + status. */
function conditionResult(flags: { damage: boolean; missing: boolean }, status: string): {
  label: string;
  tone: "ok" | "warn" | "bad";
} {
  if (flags.damage) return { label: "Damage reported", tone: "bad" };
  if (flags.missing) return { label: "Accessories missing", tone: "warn" };
  if (status !== "resolved") return { label: "Review required", tone: "warn" };
  return { label: "No issues reported", tone: "ok" };
}

type ReturnRow = {
  id: string;
  created_at: string;
  status: string;
  submission_data_json: unknown;
  submitted_by_name: string | null;
  rental_session_id: string | null;
  asset_id: string | null;
};

export default async function StaffReturnCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ shortCode: string }>;
  searchParams: Promise<{ sub?: string }>;
}) {
  const { shortCode } = await params;
  const { asset } = await requireStaffAssetByShortCode(shortCode);
  const { sub } = await searchParams;
  if (!sub) notFound();

  const supabase = await createClient();

  // RLS-scoped: a submission from another organization isn't returned → 404. Must be this asset's staff return.
  const { data } = await supabase
    .from("form_submissions")
    .select(
      "id, created_at, status, submission_data_json, submitted_by_name, rental_session_id, asset_id"
    )
    .eq("id", sub)
    .eq("form_type", "return_checklist")
    .eq("submission_origin", "staff")
    .maybeSingle<ReturnRow>();
  if (!data || data.asset_id !== asset.id) notFound();

  const reference = submissionReference(data.id, data.created_at);
  const flags = returnChecklistFlags(data.submission_data_json);
  const result = conditionResult(flags, data.status);

  // Session-evidence target (Phase 3C.2): prefer the submission's bound session; if unexpectedly null, fall
  // back to the asset's most-recent session so "View session evidence" always resolves to a real session.
  let evidenceSessionId = data.rental_session_id;
  if (!evidenceSessionId) {
    const { data: latestSession } = await supabase
      .from("asset_rental_sessions")
      .select("id")
      .eq("asset_id", asset.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    evidenceSessionId = latestSession?.id ?? null;
  }

  // Count related renter (public) return reports for the same rental session.
  let relatedRenter = 0;
  if (data.rental_session_id) {
    const { count } = await supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("rental_session_id", data.rental_session_id)
      .eq("form_type", "return_checklist")
      .eq("submission_origin", "public");
    relatedRenter = count ?? 0;
  }

  const resultToneClass =
    result.tone === "bad"
      ? "border-destructive/30 bg-destructive/10"
      : result.tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-emerald-500/30 bg-emerald-500/10";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Staff workflow
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff return checklist completed</h1>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">{asset.asset_name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{asset.asset_code}</span>
            <span className="font-mono text-xs">{reference}</span>
          </div>
        </div>

        <ul className="flex flex-col gap-1 text-sm">
          <li className="flex items-center gap-2">
            <span aria-hidden className="text-emerald-600">✓</span> Asset is now available
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="text-emerald-600">✓</span> Rental session closed
          </li>
        </ul>

        <div className={`rounded-md border px-3 py-2 text-sm ${resultToneClass}`}>
          <span className="font-medium">Condition:</span> {result.label}
          {result.tone !== "ok" ? (
            <span className="text-muted-foreground"> — kept open for follow-up.</span>
          ) : null}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Performed by</dt>
          <dd className="font-medium">{data.submitted_by_name ?? "Staff"}</dd>
          {relatedRenter > 0 ? (
            <>
              <dt className="text-muted-foreground">Renter reports</dt>
              <dd className="font-medium">
                {relatedRenter} related renter return checklist{relatedRenter === 1 ? "" : "s"} this rental
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <div className="flex flex-col gap-2">
        <Link
          href={`/dashboard/assets/${asset.id}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          View asset
        </Link>
        <Link
          href={`/dashboard/submissions/${data.id}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          View inspection
        </Link>
        {evidenceSessionId ? (
          <Link
            href={buildSessionEvidenceHref(evidenceSessionId)}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            View session evidence
          </Link>
        ) : null}
        <Link
          href={`/staff/t/${shortCode}`}
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Return to staff asset page
        </Link>
      </div>
    </main>
  );
}
