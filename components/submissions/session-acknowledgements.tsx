import { Eyebrow } from "@/components/ui/eyebrow";
import { RelativeTime } from "@/components/relative-time";
import type { AcknowledgementSummary } from "@/lib/acknowledgements/summary";

/**
 * Renter-acknowledgement summary for the session evidence view (Phase 3C.7, Part F). Reads a
 * session-scoped {@link AcknowledgementSummary} (loaded org-scoped by RLS, filtered to this one
 * rental session) and renders one of three states:
 *
 *   0  → "No renter acknowledgement recorded" (neutral — an absence, not an error).
 *   1  → "Acknowledged by {name}" + when.
 *   N  → "N acknowledgements recorded" + the latest, plus an expandable per-record list.
 *
 * This is a lightweight acknowledgement record, not a contract or legal attestation: it never uses
 * legal framing and shows the stored statement verbatim. Contact fields (email/phone) appear ONLY inside the expanded detail
 * — this whole surface is authenticated and org-scoped, never public. The expandable list carries
 * `data-evidence-section` so the Print button opens it and the full record prints.
 */
export function SessionAcknowledgements({ summary }: { summary: AcknowledgementSummary }) {
  const { count, latest, all } = summary;

  return (
    <section className="flex flex-col gap-2 rounded-[10px] border border-iron-200 bg-bone-50 p-4">
      <Eyebrow>Renter acknowledgement</Eyebrow>

      {count === 0 ? (
        <p className="text-sm text-iron-600">No renter acknowledgement recorded.</p>
      ) : count === 1 && latest ? (
        <div className="flex flex-col gap-0.5 text-sm">
          <p className="text-iron-950">
            Acknowledged by <span className="font-medium">{latest.name ?? "Unnamed renter"}</span>
          </p>
          <p className="text-iron-600">
            <RelativeTime value={latest.acknowledged_at} />
          </p>
          {latest.statement ? (
            <p className="mt-1 text-xs text-iron-600">“{latest.statement}”</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-iron-950">{count} acknowledgements recorded</p>
            {latest ? (
              <p className="text-iron-600">
                Latest: {latest.name ?? "Unnamed renter"} ·{" "}
                <RelativeTime value={latest.acknowledged_at} />
              </p>
            ) : null}
          </div>
          <details
            data-evidence-section
            className="group rounded-md border border-iron-200 bg-background"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-iron-600 [&::-webkit-details-marker]:hidden">
              <span>View all acknowledgements</span>
              <span aria-hidden className="transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <ul className="divide-y divide-iron-200 border-t border-iron-200">
              {all.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-iron-950">{a.name ?? "Unnamed renter"}</span>
                    <RelativeTime value={a.acknowledged_at} className="text-xs text-iron-600" />
                  </div>
                  {a.statement ? <p className="text-xs text-iron-600">“{a.statement}”</p> : null}
                  {a.email || a.phone ? (
                    <p className="text-xs text-iron-600">
                      {[a.email, a.phone].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
