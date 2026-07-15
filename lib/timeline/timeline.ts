/**
 * Pure builder for a single asset's read-only condition timeline. Takes already-fetched, asset-scoped rows and
 * merges them into one chronological list (newest first). No I/O: the page (or the bounded page-loader in
 * `timeline-page.ts`) does the RLS-scoped reads. Because every event derives only from the passed arrays, the
 * timeline is inherently single-asset.
 *
 * Phase 3C.8: every event now carries a globally stable `key` (`${kind}:${sourceId}`) and the sort is
 * `(at desc, key desc)`, so the same rows can be sliced/paginated deterministically. The per-source row→event
 * mappers are exported so the bounded cursor loader reuses this exact presentation logic.
 */

import { submissionTypeLabel } from "@/lib/submissions/origin";
import { submissionReference } from "@/lib/submissions/inbox";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";
import { buildSessionEvidenceHref } from "@/lib/rentals/evidence";

export type TimelineKind =
  | "created"
  | "submission"
  | "acknowledgement"
  | "tag_request"
  | "rental_started"
  | "rental_ended"
  | "archived";

export type TimelineEvent = {
  /** Globally stable, unique event key `${kind}:${sourceId}` — React key + dedup. */
  key: string;
  /** The source row id (uuid) — the cursor tie-breaker; global order is `(at desc, sourceId desc)`. */
  sourceId: string;
  kind: TimelineKind;
  at: string;
  title: string;
  detail?: string;
  badge?: string;
  /** Contact line for an acknowledgement (email · phone), when present. */
  contact?: string;
  /** The acknowledged statement text — shown so the record reads as a record. */
  statement?: string;
  /** Admin link for more detail (e.g. the submission detail page). */
  href?: string;
  /** Number of private attachments (admins open them via `href`). */
  attachmentCount?: number;
  /** Submission presentation fields (Phase 3C) — let the timeline card match the inbox row. */
  formType?: string;
  origin?: string | null;
  reference?: string;
  status?: string;
  damage?: boolean;
  missing?: boolean;
  /** Rental-session fields (Phase 3C.8, Part I) — for rental_started / rental_ended rows. */
  sessionId?: string;
  sessionRef?: string;
  sessionEvidenceHref?: string;
};

export type TimelineSubmission = {
  id: string;
  form_type: string;
  status: string;
  created_at: string;
  submitted_by_name: string | null;
  attachmentCount: number;
  /** 'public' (renter) | 'staff' — distinguishes staff vs renter returns in the title. */
  origin?: string | null;
  /** Canonical open-damage / missing-items flags (Phase 3C) — derived by the caller. */
  damage?: boolean;
  missing?: boolean;
};

export type TimelineAcknowledgement = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  statement: string | null;
  created_at: string;
};

export type TimelineTagRequest = { id: string; status: string; created_at: string };

export type TimelineRentalSession = {
  id: string;
  status: string;
  rental_reference: string | null;
  renter_label: string | null;
  started_at: string;
  returned_at: string | null;
};

export type TimelineInput = {
  assetCreatedAt: string | null;
  archivedAt: string | null;
  submissions: TimelineSubmission[];
  acknowledgements: TimelineAcknowledgement[];
  tagRequests: TimelineTagRequest[];
  rentalSessions: TimelineRentalSession[];
};

/** The canonical rental-session reference (derived, not stored): SUB-…→RNT-… on the session id + start year. */
export function rentalSessionRef(id: string, startedAt: string): string {
  return submissionReference(id, startedAt).replace("SUB", "RNT");
}

// ---- per-source mappers (reused by the bounded loader) --------------------

export function submissionToEvent(s: TimelineSubmission): TimelineEvent {
  return {
    key: `submission:${s.id}`,
    sourceId: s.id,
    kind: "submission",
    at: s.created_at,
    title: submissionTypeLabel(s.form_type, s.origin),
    detail: s.submitted_by_name ?? undefined,
    badge: s.status,
    href: `/dashboard/submissions/${s.id}`,
    attachmentCount: s.attachmentCount,
    formType: s.form_type,
    origin: s.origin ?? null,
    reference: submissionReference(s.id, s.created_at),
    status: s.status,
    damage: s.damage ?? false,
    missing: s.missing ?? false,
  };
}

export function acknowledgementToEvent(a: TimelineAcknowledgement): TimelineEvent {
  const contact = [a.email, a.phone].filter(Boolean).join(" · ");
  return {
    key: `acknowledgement:${a.id}`,
    sourceId: a.id,
    kind: "acknowledgement",
    at: a.created_at,
    title: "Acknowledgement",
    detail: a.name ?? undefined,
    contact: contact || undefined,
    statement: a.statement ?? undefined,
  };
}

export function tagRequestToEvent(t: TimelineTagRequest): TimelineEvent {
  return {
    key: `tag_request:${t.id}`,
    sourceId: t.id,
    kind: "tag_request",
    at: t.created_at,
    title: "Tag request",
    badge: tagRequestStatusLabel(t.status),
  };
}

export function rentalStartedToEvent(r: TimelineRentalSession): TimelineEvent {
  const who = [r.renter_label, r.rental_reference].filter(Boolean).join(" · ");
  return {
    key: `rental_started:${r.id}`,
    sourceId: r.id,
    kind: "rental_started",
    at: r.started_at,
    title: "Rental started",
    detail: who || undefined,
    sessionId: r.id,
    sessionRef: rentalSessionRef(r.id, r.started_at),
    sessionEvidenceHref: buildSessionEvidenceHref(r.id),
  };
}

/** The rental_ended event, or null for a still-active (no returned_at) session. */
export function rentalEndedToEvent(r: TimelineRentalSession): TimelineEvent | null {
  if (!r.returned_at) return null;
  const who = [r.renter_label, r.rental_reference].filter(Boolean).join(" · ");
  return {
    key: `rental_ended:${r.id}`,
    sourceId: r.id,
    kind: "rental_ended",
    at: r.returned_at,
    title: r.status === "cancelled" ? "Rental cancelled" : "Rental returned",
    detail: who || undefined,
    sessionId: r.id,
    sessionRef: rentalSessionRef(r.id, r.started_at),
    sessionEvidenceHref: buildSessionEvidenceHref(r.id),
  };
}

export function createdEvent(at: string): TimelineEvent {
  return { key: "created:asset", sourceId: "asset", kind: "created", at, title: "Asset created" };
}

export function archivedEvent(at: string): TimelineEvent {
  return { key: "archived:asset", sourceId: "asset", kind: "archived", at, title: "Asset archived" };
}

/**
 * Newest first; ties broken deterministically by the source id (desc) — the same `(at desc, id desc)` order the
 * cursor keyset uses — with the full event key as a final safety net. Returns a new array.
 */
export function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort(
    (a, b) => b.at.localeCompare(a.at) || b.sourceId.localeCompare(a.sourceId) || b.key.localeCompare(a.key)
  );
}

export function buildAssetTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const s of input.submissions) events.push(submissionToEvent(s));
  for (const a of input.acknowledgements) events.push(acknowledgementToEvent(a));
  for (const t of input.tagRequests) events.push(tagRequestToEvent(t));
  for (const r of input.rentalSessions) {
    events.push(rentalStartedToEvent(r));
    const ended = rentalEndedToEvent(r);
    if (ended) events.push(ended);
  }
  if (input.archivedAt) events.push(archivedEvent(input.archivedAt));
  if (input.assetCreatedAt) events.push(createdEvent(input.assetCreatedAt));

  return sortTimelineEvents(events);
}
