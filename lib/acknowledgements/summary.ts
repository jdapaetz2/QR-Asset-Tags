/**
 * Pure summarizer for a rental session's renter acknowledgements (Phase 3C.7). No I/O: the evidence
 * loader fetches the rows (org-scoped by RLS, filtered to a single `rental_session_id`) and this
 * shapes them for display. A lightweight record, NOT an e-signature or a contract.
 */

export type AcknowledgementRecord = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  statement: string | null;
  acknowledged_at: string | null;
};

export type AcknowledgementSummary = {
  count: number;
  /** Newest acknowledgement by `acknowledged_at` (null when there are none). */
  latest: AcknowledgementRecord | null;
  /** All records, newest-first. */
  all: AcknowledgementRecord[];
};

/**
 * Shape a session's acknowledgement rows for the evidence view: newest-first, plus the count and the
 * latest record. Input order is not trusted (the query already orders desc, but this stays correct
 * regardless); rows missing a timestamp sort last.
 */
export function summarizeAcknowledgements(
  rows: AcknowledgementRecord[] | null | undefined
): AcknowledgementSummary {
  const all = [...(rows ?? [])].sort((a, b) => {
    const ta = a.acknowledged_at ? Date.parse(a.acknowledged_at) : -Infinity;
    const tb = b.acknowledged_at ? Date.parse(b.acknowledged_at) : -Infinity;
    return tb - ta;
  });
  return { count: all.length, latest: all[0] ?? null, all };
}
