/**
 * Pure builder for a single asset's read-only condition timeline. Takes
 * already-fetched, asset-scoped rows and merges them into one chronological list
 * (newest first). No I/O: the page does the RLS-scoped reads. Because every event
 * derives only from the passed arrays, the timeline is inherently single-asset.
 */

import { formTypeLabel } from "@/lib/submissions/display";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";

export type TimelineKind =
  | "created"
  | "submission"
  | "acknowledgement"
  | "tag_request"
  | "rental_started"
  | "rental_ended"
  | "archived";

export type TimelineEvent = {
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
};

export type TimelineInput = {
  assetCreatedAt: string | null;
  archivedAt: string | null;
  submissions: {
    id: string;
    form_type: string;
    status: string;
    created_at: string;
    submitted_by_name: string | null;
    attachmentCount: number;
  }[];
  acknowledgements: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    statement: string | null;
    created_at: string;
  }[];
  tagRequests: {
    id: string;
    status: string;
    created_at: string;
  }[];
  rentalSessions: {
    id: string;
    status: string;
    rental_reference: string | null;
    renter_label: string | null;
    started_at: string;
    returned_at: string | null;
  }[];
};

export function buildAssetTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const s of input.submissions) {
    events.push({
      kind: "submission",
      at: s.created_at,
      title: formTypeLabel(s.form_type),
      detail: s.submitted_by_name ?? undefined,
      badge: s.status,
      href: `/dashboard/submissions/${s.id}`,
      attachmentCount: s.attachmentCount,
    });
  }

  for (const a of input.acknowledgements) {
    const contact = [a.email, a.phone].filter(Boolean).join(" · ");
    events.push({
      kind: "acknowledgement",
      at: a.created_at,
      title: "Acknowledgement",
      detail: a.name ?? undefined,
      contact: contact || undefined,
      statement: a.statement ?? undefined,
    });
  }

  for (const t of input.tagRequests) {
    events.push({
      kind: "tag_request",
      at: t.created_at,
      title: "Tag request",
      badge: tagRequestStatusLabel(t.status),
    });
  }

  for (const r of input.rentalSessions) {
    const who = [r.renter_label, r.rental_reference].filter(Boolean).join(" · ");
    events.push({
      kind: "rental_started",
      at: r.started_at,
      title: "Rental started",
      detail: who || undefined,
    });
    if (r.returned_at) {
      events.push({
        kind: "rental_ended",
        at: r.returned_at,
        title: r.status === "cancelled" ? "Rental cancelled" : "Rental returned",
        detail: who || undefined,
      });
    }
  }

  if (input.archivedAt) {
    events.push({ kind: "archived", at: input.archivedAt, title: "Asset archived" });
  }

  if (input.assetCreatedAt) {
    events.push({
      kind: "created",
      at: input.assetCreatedAt,
      title: "Asset created",
    });
  }

  // Newest first; ties broken stably enough for display.
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
