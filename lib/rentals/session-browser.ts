/**
 * Bounded, cursor-paginated organization rental-session browser (Phase 3C.8, Part J).
 *
 * A lightweight authenticated index/search over `asset_rental_sessions` for the current org (RLS-scoped; no
 * service role). NOT a booking/rental-order system. Single ordered source (`started_at desc, id desc`) with a
 * keyset cursor, `limit pageSize+1`. Exact RNT reference search reverses the derived reference to an indexed
 * PRIMARY-KEY uuid range. Free-text asset / renter search is PREFIX-only (`ilike 'term%'`, sanitized) — no
 * leading wildcard, org-scoped, bounded by the page limit. The query surface is injected for unit tests.
 */

import {
  isBelowCursor,
  isUuidLike,
  isIsoTimestamp,
  uuidRangeFromHexPrefix,
  encodeCursor,
  parseReferenceQuery,
  datePresetToRange,
  type TimelineCursor,
  type ParsedReference,
  type DatePreset,
} from "@/lib/timeline/cursor";
import { formatDbError, type DbError } from "@/lib/db/errors";

export const SESSION_PAGE_SIZE = 50;

type QResult<T> = { data: T | null; error: DbError | null };

export type SessionAsset = { asset_code: string; asset_name: string };

export type BrowserSession = {
  id: string;
  status: string;
  rental_reference: string | null;
  renter_label: string | null;
  started_at: string;
  returned_at: string | null;
  asset: SessionAsset | null;
  /** Derived RNT reference (RNT-YYYY-XXXXXX). */
  reference: string;
};

type SessionRowRaw = {
  id: string;
  status: string;
  rental_reference: string | null;
  renter_label: string | null;
  started_at: string;
  returned_at: string | null;
  asset: SessionAsset | SessionAsset[] | null;
};

export type SessionStatusFilter = "all" | "active" | "returned";

export type SessionQueryArgs = {
  cursorAt: string | null; // strict keyset on (started_at, id)
  cursorId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  status: SessionStatusFilter;
  idLo?: string;
  idHi?: string;
  renterPrefix?: string; // sanitized
  assetIds?: string[]; // resolved from an asset search
  assetId?: string | null; // ?asset= prefilter
  limit: number;
};

export interface SessionBrowserClient {
  loadSessions(args: SessionQueryArgs): Promise<QResult<SessionRowRaw[]>>;
  /** Org-scoped asset code/name PREFIX search → matching asset ids (bounded). */
  findAssetIds(prefix: string): Promise<QResult<string[]>>;
}

export type SessionBrowserPage = {
  sessions: BrowserSession[];
  nextCursor: string | null;
  hasMore: boolean;
  appliedFilters: SessionFilters;
};

export type SessionFilters = {
  q: string;
  reference: ParsedReference;
  assetSearch: string;
  renterSearch: string;
  status: SessionStatusFilter;
  range: DatePreset;
  from: string | null;
  to: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  invalidRange: boolean;
  assetId: string | null;
  active: boolean;
};

const STATUS_VALUES: readonly SessionStatusFilter[] = ["all", "active", "returned"];
const DATE_PRESETS: readonly DatePreset[] = ["all", "7d", "30d", "90d", "1y", "custom"];

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Keep only safe prefix-search characters; strips PostgREST filter metacharacters. Capped length. */
export function sanitizePrefix(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .slice(0, 40);
}

export function parseSessionFilters(
  params: Record<string, string | string[] | undefined>,
  now: Date
): SessionFilters {
  const q = first(params.q).trim().slice(0, 32);
  const assetSearch = sanitizePrefix(first(params.asset_q));
  const renterSearch = sanitizePrefix(first(params.renter_q));
  const rawStatus = first(params.status) as SessionStatusFilter;
  const status = STATUS_VALUES.includes(rawStatus) ? rawStatus : "all";
  const rawRange = first(params.range) as DatePreset;
  const range = DATE_PRESETS.includes(rawRange) ? rawRange : "all";
  const from = first(params.from) || null;
  const to = first(params.to) || null;
  const assetId = first(params.asset) || null;
  const resolved = datePresetToRange(range, from, to, now);

  return {
    q,
    reference: parseReferenceQuery(q),
    assetSearch,
    renterSearch,
    status,
    range,
    from,
    to,
    dateFrom: resolved.dateFrom,
    dateTo: resolved.dateTo,
    invalidRange: resolved.invalid,
    assetId,
    active:
      q !== "" ||
      assetSearch !== "" ||
      renterSearch !== "" ||
      status !== "all" ||
      range !== "all",
  };
}

/** Normalize the raw row (embedded asset may be array or object) and derive the RNT reference. */
function normalizeSession(row: SessionRowRaw): BrowserSession {
  const asset = Array.isArray(row.asset) ? (row.asset[0] ?? null) : row.asset;
  return {
    id: row.id,
    status: row.status,
    rental_reference: row.rental_reference,
    renter_label: row.renter_label,
    started_at: row.started_at,
    returned_at: row.returned_at,
    asset: asset ?? null,
    reference: rentalReference(row.id, row.started_at),
  };
}

/** Derived rental-session reference (matches lib/timeline/timeline.ts rentalSessionRef). */
function rentalReference(id: string, startedAt: string): string {
  const d = new Date(startedAt);
  const year = Number.isNaN(d.getTime()) ? "0000" : String(d.getUTCFullYear()).padStart(4, "0");
  const suffix = (id ?? "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase().padEnd(6, "0");
  return `RNT-${year}-${suffix}`;
}

export async function getRentalSessionsPage(input: {
  client: SessionBrowserClient;
  cursor: TimelineCursor | null;
  pageSize?: number;
  filters: SessionFilters;
}): Promise<SessionBrowserPage> {
  const { client, cursor, filters } = input;
  const pageSize = Math.min(Math.max(1, input.pageSize ?? SESSION_PAGE_SIZE), SESSION_PAGE_SIZE);
  const limit = pageSize + 1;

  // A reference field that isn't a canonical RNT never matches a session (SUB is a submission reference).
  if (filters.q !== "" && filters.reference.kind !== "RNT") {
    return { sessions: [], nextCursor: null, hasMore: false, appliedFilters: filters };
  }

  // Resolve an asset code/name search to ids first; an empty result short-circuits.
  let assetIds: string[] | undefined;
  if (filters.assetSearch) {
    const r = await client.findAssetIds(filters.assetSearch);
    if (r.error) throw formatDbError("session-browser: asset search failed", r.error);
    assetIds = r.data ?? [];
    if (assetIds.length === 0) {
      return { sessions: [], nextCursor: null, hasMore: false, appliedFilters: filters };
    }
  }

  const idRange = filters.reference.kind === "RNT" && filters.reference.hex6
    ? uuidRangeFromHexPrefix(filters.reference.hex6)
    : undefined;

  const result = await client.loadSessions({
    cursorAt: cursor?.at ?? null,
    cursorId: cursor?.id ?? null,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    status: filters.status,
    idLo: idRange?.lo,
    idHi: idRange?.hi,
    renterPrefix: filters.renterSearch || undefined,
    assetIds,
    assetId: filters.assetId,
    limit,
  });
  if (result.error) throw formatDbError("session-browser: session load failed", result.error);

  const rows = (result.data ?? []).map(normalizeSession);
  const filtered = rows
    .filter((s) => isBelowCursor(s.started_at, s.id, cursor))
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id));

  const hasMore = filtered.length > pageSize;
  const sessions = filtered.slice(0, pageSize);
  const last = sessions[sessions.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ at: last.started_at, id: last.id }) : null;

  return { sessions, nextCursor, hasMore, appliedFilters: filters };
}

// Type-only import (erased at runtime) so this module stays node-test safe.
import type { createClient } from "@/lib/supabase/server";
type ServerClient = Awaited<ReturnType<typeof createClient>>;

export function createSessionBrowserClient(supabase: ServerClient): SessionBrowserClient {
  return {
    findAssetIds: async (prefix) => {
      const p = sanitizePrefix(prefix);
      if (!p) return { data: [], error: null };
      const { data, error } = (await supabase
        .from("assets")
        .select("id")
        .or(`asset_code.ilike.${p}%,asset_name.ilike.${p}%`)
        .limit(200)) as unknown as { data: { id: string }[] | null; error: { message: string } | null };
      if (error) return { data: null, error };
      return { data: (data ?? []).map((r) => r.id), error: null };
    },
    loadSessions: async (args) => {
      // Explicit FK hint (Phase 3C.8.1): asset_rental_sessions has TWO relationships to assets
      // (asset_id → assets.id AND assets.active_rental_session_id → asset_rental_sessions.id), so a bare
      // `assets(...)` embed is ambiguous (PGRST201). Disambiguate through the intended asset_id constraint.
      let q = supabase
        .from("asset_rental_sessions")
        .select(
          "id, status, rental_reference, renter_label, started_at, returned_at, asset:assets!asset_rental_sessions_asset_id_fkey(asset_code, asset_name)"
        );
      if (args.idLo && args.idHi) q = q.gte("id", args.idLo).lte("id", args.idHi);
      if (args.assetId) q = q.eq("asset_id", args.assetId);
      if (args.assetIds) q = q.in("asset_id", args.assetIds);
      if (args.status === "active") q = q.eq("status", "active");
      else if (args.status === "returned") q = q.in("status", ["returned", "cancelled"]);
      if (args.renterPrefix) {
        const t = sanitizePrefix(args.renterPrefix);
        q = q.or(`renter_label.ilike.${t}%,rental_reference.ilike.${t}%`);
      }
      if (args.dateFrom) q = q.gte("started_at", args.dateFrom);
      if (args.dateTo) q = q.lt("started_at", args.dateTo);
      // Strict keyset on (started_at, id) — advances past the boundary row (validated shape → safe `.or`).
      if (args.cursorAt && args.cursorId && isIsoTimestamp(args.cursorAt) && isUuidLike(args.cursorId)) {
        q = q.or(`started_at.lt.${args.cursorAt},and(started_at.eq.${args.cursorAt},id.lt.${args.cursorId})`);
      } else if (args.cursorAt && isIsoTimestamp(args.cursorAt)) {
        q = q.lt("started_at", args.cursorAt);
      }
      return (await q
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(args.limit)) as unknown as QResult<SessionRowRaw[]>;
    },
  };
}
