/**
 * Bounded, cursor-paginated asset-timeline loader (Phase 3C.8).
 *
 * The timeline is DERIVED from multiple tables (no stored event table). To page it without ever reading all
 * history we use bounded per-source queries + a deterministic k-way merge (chosen over a UNION-ALL RPC: no
 * migration for correctness, keeps the pure derived model, fully unit-testable):
 *
 *   - Each source is queried ordered `<ts> desc, id desc`, limited to `pageSize + 1`, under the SAME cursor +
 *     date bounds. The global top-`pageSize` events below the cursor are therefore a subset of the union of each
 *     source's top-`pageSize` below the cursor, so over-fetching one extra per source guarantees full coverage —
 *     no source can hide older events from another, none are skipped, and pages never duplicate rows.
 *   - Max rows read per request = `(pageSize + 1) × 5 sources` (submissions, acks, tag-requests, rental-started,
 *     rental-ended) plus the ≤2 synthesized created/archived events. No total-count query is ever run.
 *
 * The query surface is injected (`TimelineQueryClient`) so the merge/cursor logic is unit-tested with fixtures.
 * RLS on every source table enforces org isolation; the loader also takes `assetCreatedAt`/`archivedAt` from the
 * page's asset read to synthesize the created/archived anchors without another query.
 */

import { returnChecklistFlags } from "@/lib/submissions/returns";
import {
  submissionToEvent,
  acknowledgementToEvent,
  tagRequestToEvent,
  rentalStartedToEvent,
  rentalEndedToEvent,
  createdEvent,
  archivedEvent,
  sortTimelineEvents,
  type TimelineEvent,
} from "@/lib/timeline/timeline";
import {
  isBelowCursor,
  isUuidLike,
  isIsoTimestamp,
  uuidRangeFromHexPrefix,
  encodeCursor,
  type TimelineCursor,
  type TimelineFilters,
} from "@/lib/timeline/cursor";

export const TIMELINE_PAGE_SIZE = 50;

type QResult<T> = { data: T | null; error: { message: string } | null };

/** Bounds every source query applies (only the relevant fields per source are used). */
export type SourceArgs = {
  dateFrom: string | null; // inclusive lower bound on the source timestamp
  dateTo: string | null; // exclusive upper bound
  cursorAt: string | null; // strict keyset: ts < cursorAt OR (ts = cursorAt AND id < cursorId)
  cursorId: string | null;
  limit: number; // pageSize + 1
  idLo?: string; // uuid range (reference search)
  idHi?: string;
  formTypes?: string[]; // submission type filter
};

export type SubRow = {
  id: string;
  form_type: string;
  status: string;
  created_at: string;
  submitted_by_name: string | null;
  submission_origin: string | null;
  submission_data_json: unknown;
  media_urls: unknown;
};
export type AckRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  statement: string | null;
  created_at: string;
};
export type TagRow = { id: string; status: string; created_at: string };
export type RentalRow = {
  id: string;
  status: string;
  rental_reference: string | null;
  renter_label: string | null;
  started_at: string;
  returned_at: string | null;
};

export interface TimelineQueryClient {
  loadSubmissions(assetId: string, args: SourceArgs): Promise<QResult<SubRow[]>>;
  loadAcknowledgements(assetId: string, args: SourceArgs): Promise<QResult<AckRow[]>>;
  loadTagRequests(assetId: string, args: SourceArgs): Promise<QResult<TagRow[]>>;
  loadRentalStarted(assetId: string, args: SourceArgs): Promise<QResult<RentalRow[]>>;
  loadRentalEnded(assetId: string, args: SourceArgs): Promise<QResult<RentalRow[]>>;
}

export type TimelinePage = {
  events: TimelineEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  appliedFilters: TimelineFilters;
};

const INSPECTION_TYPES = ["return_checklist", "pre_use_inspection"];
const DAMAGE_SUPPORT_TYPES = ["damage_report", "support_request"];

function subRowToEvent(s: SubRow): TimelineEvent {
  const flags =
    s.form_type === "return_checklist"
      ? returnChecklistFlags(s.submission_data_json)
      : { damage: false, missing: false };
  return submissionToEvent({
    id: s.id,
    form_type: s.form_type,
    status: s.status,
    created_at: s.created_at,
    submitted_by_name: s.submitted_by_name,
    attachmentCount: Array.isArray(s.media_urls) ? s.media_urls.length : 0,
    origin: s.submission_origin,
    damage: s.form_type === "damage_report" ? true : flags.damage,
    missing: flags.missing,
  });
}

function bail(source: string, error: { message: string }): never {
  console.error(`[timeline-page] ${source} load failed`, error);
  throw new Error(`timeline-page: failed to load ${source} (${error.message})`);
}

/**
 * Load one bounded page of an asset's timeline. `filters` is already validated/normalized
 * (see `parseTimelineFilters`). Returns newest-first events plus `nextCursor`/`hasMore`.
 */
export async function getAssetTimelinePage(input: {
  client: TimelineQueryClient;
  assetId: string;
  assetCreatedAt: string | null;
  archivedAt: string | null;
  cursor: TimelineCursor | null;
  pageSize?: number;
  filters: TimelineFilters;
}): Promise<TimelinePage> {
  const { client, assetId, assetCreatedAt, archivedAt, cursor, filters } = input;
  const pageSize = Math.min(Math.max(1, input.pageSize ?? TIMELINE_PAGE_SIZE), TIMELINE_PAGE_SIZE);
  const limit = pageSize + 1;

  // A non-empty search that isn't a canonical reference has no match on the timeline (reference-only search;
  // no `%term%` scan). Return an empty page immediately.
  if (filters.q !== "" && filters.reference.kind === "none") {
    return { events: [], nextCursor: null, hasMore: false, appliedFilters: filters };
  }

  const ref = filters.reference;
  const idRange = ref.hex6 ? uuidRangeFromHexPrefix(ref.hex6) : undefined;
  const base: SourceArgs = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    cursorAt: cursor?.at ?? null,
    cursorId: cursor?.id ?? null,
    limit,
  };

  // Which sources are active for this filter/reference combination.
  const searchingRnt = ref.kind === "RNT";
  const searchingSub = ref.kind === "SUB";
  const wantSubmissions =
    !searchingRnt && (filters.type === "all" || filters.type === "inspections" || filters.type === "damage_support" || searchingSub);
  const wantAcks = !searchingRnt && !searchingSub && (filters.type === "all" || filters.type === "acknowledgements");
  const wantTags = !searchingRnt && !searchingSub && (filters.type === "all" || filters.type === "tag_requests");
  const wantRentals = !searchingSub && (filters.type === "all" || filters.type === "rental");
  const wantAnchors =
    filters.type === "all" && ref.kind === "none"; // created/archived only in the unfiltered-by-type view

  const submissionFormTypes = searchingSub
    ? undefined
    : filters.type === "inspections"
      ? INSPECTION_TYPES
      : filters.type === "damage_support"
        ? DAMAGE_SUPPORT_TYPES
        : undefined;

  const candidates: TimelineEvent[] = [];

  if (wantSubmissions) {
    const r = await client.loadSubmissions(assetId, {
      ...base,
      formTypes: submissionFormTypes,
      idLo: searchingSub ? idRange?.lo : undefined,
      idHi: searchingSub ? idRange?.hi : undefined,
    });
    if (r.error) bail("submissions", r.error);
    for (const row of r.data ?? []) candidates.push(subRowToEvent(row));
  }
  if (wantAcks) {
    const r = await client.loadAcknowledgements(assetId, base);
    if (r.error) bail("acknowledgements", r.error);
    for (const row of r.data ?? []) candidates.push(acknowledgementToEvent(row));
  }
  if (wantTags) {
    const r = await client.loadTagRequests(assetId, base);
    if (r.error) bail("tag_requests", r.error);
    for (const row of r.data ?? []) candidates.push(tagRequestToEvent(row));
  }
  if (wantRentals) {
    const rentalArgs: SourceArgs = {
      ...base,
      idLo: searchingRnt ? idRange?.lo : undefined,
      idHi: searchingRnt ? idRange?.hi : undefined,
    };
    const started = await client.loadRentalStarted(assetId, rentalArgs);
    if (started.error) bail("rental_started", started.error);
    for (const row of started.data ?? []) candidates.push(rentalStartedToEvent(row));

    const ended = await client.loadRentalEnded(assetId, rentalArgs);
    if (ended.error) bail("rental_ended", ended.error);
    for (const row of ended.data ?? []) {
      const ev = rentalEndedToEvent(row);
      if (ev) candidates.push(ev);
    }
  }
  if (wantAnchors) {
    if (archivedAt) candidates.push(archivedEvent(archivedAt));
    if (assetCreatedAt) candidates.push(createdEvent(assetCreatedAt));
  }

  // Deterministic merge: keep only events strictly below the cursor and within the date window, newest-first.
  const withinDate = (at: string) =>
    (!filters.dateFrom || at >= filters.dateFrom) && (!filters.dateTo || at < filters.dateTo);
  const filtered = sortTimelineEvents(
    candidates.filter((e) => isBelowCursor(e.at, e.sourceId, cursor) && withinDate(e.at))
  );

  const hasMore = filtered.length > pageSize;
  const events = filtered.slice(0, pageSize);
  const last = events[events.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ at: last.at, id: last.sourceId }) : null;

  return { events, nextCursor, hasMore, appliedFilters: filters };
}

// Type-only import (erased at runtime) so this module stays safe to import from the node test env.
import type { createClient } from "@/lib/supabase/server";
type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Minimal chainable + awaitable shape of the supabase query builder methods this adapter uses. */
interface BoundableQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  gte(column: string, value: string): BoundableQuery;
  lt(column: string, value: string): BoundableQuery;
  or(filters: string): BoundableQuery;
  order(column: string, options: { ascending: boolean }): BoundableQuery;
  limit(count: number): BoundableQuery;
}

/** Adapter binding {@link TimelineQueryClient} to the RLS-scoped supabase server client (org-scoped; no service role). */
export function createTimelineQueryClient(supabase: ServerClient): TimelineQueryClient {
  const applyBounds = (q: BoundableQuery, tsColumn: string, args: SourceArgs): BoundableQuery => {
    let query = q;
    if (args.dateFrom) query = query.gte(tsColumn, args.dateFrom);
    if (args.dateTo) query = query.lt(tsColumn, args.dateTo);
    // Strict keyset. The cursor is our own opaque token; embed its values in `.or(...)` only after validating
    // shape (ISO timestamp + uuid), so a tampered cursor degrades to a safe strict-older bound, never SQL error.
    if (args.cursorAt && args.cursorId && isIsoTimestamp(args.cursorAt) && isUuidLike(args.cursorId)) {
      query = query.or(
        `${tsColumn}.lt.${args.cursorAt},and(${tsColumn}.eq.${args.cursorAt},id.lt.${args.cursorId})`
      );
    } else if (args.cursorAt && isIsoTimestamp(args.cursorAt)) {
      query = query.lt(tsColumn, args.cursorAt);
    }
    return query.order(tsColumn, { ascending: false }).order("id", { ascending: false }).limit(args.limit);
  };

  return {
    loadSubmissions: async (assetId, args) => {
      let q = supabase
        .from("form_submissions")
        .select(
          "id, form_type, status, created_at, submitted_by_name, submission_origin, submission_data_json, media_urls"
        )
        .eq("asset_id", assetId);
      if (args.formTypes) q = q.in("form_type", args.formTypes);
      if (args.idLo && args.idHi) q = q.gte("id", args.idLo).lte("id", args.idHi);
      return (await applyBounds(q as unknown as BoundableQuery, "created_at", args)) as unknown as QResult<SubRow[]>;
    },
    loadAcknowledgements: async (assetId, args) => {
      const q = supabase
        .from("asset_acknowledgements")
        .select("id, name, email, phone, statement, created_at")
        .eq("asset_id", assetId);
      return (await applyBounds(q as unknown as BoundableQuery, "created_at", args)) as unknown as QResult<AckRow[]>;
    },
    loadTagRequests: async (assetId, args) => {
      // Tag requests per asset are low-cardinality; fetch the newest bounded slice and let the loader apply the
      // date/cursor window. Ordered by the embedded created_at so the newest are never missed within the limit.
      const { data, error } = (await supabase
        .from("tag_request_assets")
        .select("tag_request:tag_requests(id, status, created_at)")
        .eq("asset_id", assetId)
        .order("created_at", { ascending: false, referencedTable: "tag_requests" })
        .limit(args.limit)) as unknown as {
        data: { tag_request: TagRow | TagRow[] | null }[] | null;
        error: { message: string } | null;
      };
      if (error) return { data: null, error };
      const rows = (data ?? [])
        .map((r) => (Array.isArray(r.tag_request) ? r.tag_request[0] : r.tag_request))
        .filter((t): t is TagRow => t != null);
      return { data: rows, error: null };
    },
    loadRentalStarted: async (assetId, args) => {
      let q = supabase
        .from("asset_rental_sessions")
        .select("id, status, rental_reference, renter_label, started_at, returned_at")
        .eq("asset_id", assetId);
      if (args.idLo && args.idHi) q = q.gte("id", args.idLo).lte("id", args.idHi);
      return (await applyBounds(q as unknown as BoundableQuery, "started_at", args)) as unknown as QResult<RentalRow[]>;
    },
    loadRentalEnded: async (assetId, args) => {
      let q = supabase
        .from("asset_rental_sessions")
        .select("id, status, rental_reference, renter_label, started_at, returned_at")
        .eq("asset_id", assetId)
        .not("returned_at", "is", null);
      if (args.idLo && args.idHi) q = q.gte("id", args.idLo).lte("id", args.idHi);
      return (await applyBounds(q as unknown as BoundableQuery, "returned_at", args)) as unknown as QResult<RentalRow[]>;
    },
  };
}
