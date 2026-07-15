/**
 * Pure cursor + query helpers for the bounded asset timeline and rental-session browser (Phase 3C.8).
 * No I/O and no ambient clock — callers inject `now` so behavior is deterministic and unit-testable.
 *
 * Cursor: an opaque base64 of `{ at, id }` where `at` is the event's ISO timestamp and `id` is the SOURCE row
 * id (the same uuid the source table orders by). The global order is `(at desc, id desc)`; every source applies
 * the STRICT keyset `ts < at OR (ts = at AND id < cursorId)`, so a source never wastes its over-fetch on the
 * boundary row — pages never duplicate or skip rows even when timestamps tie, and `hasMore` stays exact.
 */

export type TimelineCursor = { at: string; id: string };

function toBase64(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf8").toString("base64");
  // Browser fallback (cursor strings are ASCII JSON).
  return btoa(unescape(encodeURIComponent(s)));
}
function fromBase64(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s, "base64").toString("utf8");
  return decodeURIComponent(escape(atob(s)));
}

export function encodeCursor(cursor: TimelineCursor): string {
  return toBase64(JSON.stringify({ at: cursor.at, id: cursor.id }));
}

/** Decode an opaque cursor; returns null for any malformed/empty input (never throws). */
export function decodeCursor(raw: string | null | undefined): TimelineCursor | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(fromBase64(raw)) as unknown;
    if (
      obj &&
      typeof obj === "object" &&
      typeof (obj as TimelineCursor).at === "string" &&
      typeof (obj as TimelineCursor).id === "string"
    ) {
      return { at: (obj as TimelineCursor).at, id: (obj as TimelineCursor).id };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** True when event `(at,id)` sorts strictly AFTER (older than / below) the cursor in `(at desc, id desc)`. */
export function isBelowCursor(at: string, id: string, cursor: TimelineCursor | null): boolean {
  if (!cursor) return true;
  if (at < cursor.at) return true;
  if (at > cursor.at) return false;
  return id < cursor.id; // same timestamp → tie-break by id desc
}

/** A uuid-shaped id is safe to embed in a PostgREST keyset `.or(...)`; anything else (e.g. anchor ids) is not. */
export function isUuidLike(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** An ISO-8601 timestamp is safe to embed in a PostgREST keyset `.or(...)` (contains no comma/paren). */
export function isIsoTimestamp(at: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(at) || !Number.isNaN(Date.parse(at));
}

// ---------------------------------------------------------------------------
// Reference search (RNT-YYYY-XXXXXX / SUB-YYYY-XXXXXX are DERIVED, not stored).
// ---------------------------------------------------------------------------

export type ReferenceKind = "RNT" | "SUB" | "none";
export type ParsedReference = { kind: ReferenceKind; year: number | null; hex6: string | null };

const REFERENCE_RE = /^(RNT|SUB)-(\d{4})-([0-9A-F]{6})$/;

/** Parse a canonical reference. Case-insensitive, whitespace-trimmed. Non-matching input → { kind: "none" }. */
export function parseReferenceQuery(raw: string | null | undefined): ParsedReference {
  const q = (raw ?? "").trim().toUpperCase();
  const m = REFERENCE_RE.exec(q);
  if (!m) return { kind: "none", year: null, hex6: null };
  return { kind: m[1] as "RNT" | "SUB", year: Number(m[2]), hex6: m[3].toLowerCase() };
}

/**
 * The inclusive uuid range whose canonical text starts with the given 6 hex chars. A reference's suffix is the
 * first 6 hex of the row's uuid, so an exact-reference lookup becomes an indexed PRIMARY-KEY range scan
 * (`id BETWEEN lo AND hi`) — bounded, no leading-wildcard text search, no new index.
 */
export function uuidRangeFromHexPrefix(hex6: string): { lo: string; hi: string } {
  const p = hex6.toLowerCase();
  return {
    lo: `${p}00-0000-0000-0000-000000000000`,
    hi: `${p}ff-ffff-ffff-ffff-ffffffffffff`,
  };
}

// ---------------------------------------------------------------------------
// Date presets + filter parsing
// ---------------------------------------------------------------------------

export type DatePreset = "all" | "7d" | "30d" | "90d" | "1y" | "custom";
export type EventTypeFilter =
  | "all"
  | "rental"
  | "inspections"
  | "damage_support"
  | "acknowledgements"
  | "tag_requests";

const DATE_PRESETS: readonly DatePreset[] = ["all", "7d", "30d", "90d", "1y", "custom"];
const EVENT_TYPES: readonly EventTypeFilter[] = [
  "all",
  "rental",
  "inspections",
  "damage_support",
  "acknowledgements",
  "tag_requests",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS: Record<Exclude<DatePreset, "all" | "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/** Strict YYYY-MM-DD → a UTC Date (start of that day), or null if malformed / not a real date. */
function parseYmd(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export type ResolvedDateRange = { dateFrom: string | null; dateTo: string | null; invalid: boolean };

/**
 * Resolve a preset (or custom from/to) into an inclusive `[dateFrom, dateTo)` ISO window. `dateTo` is
 * exclusive (start of the day after `to`) so a whole `to` day is included. Invalid custom input → `invalid:true`
 * with a null window (the caller falls back to "all time").
 */
export function datePresetToRange(
  preset: DatePreset,
  from: string | null | undefined,
  to: string | null | undefined,
  now: Date
): ResolvedDateRange {
  if (preset === "all") return { dateFrom: null, dateTo: null, invalid: false };
  if (preset === "custom") {
    const f = parseYmd(from);
    const t = parseYmd(to);
    if (!f && !t) return { dateFrom: null, dateTo: null, invalid: true };
    if (f && t && f.getTime() > t.getTime()) return { dateFrom: null, dateTo: null, invalid: true };
    return {
      dateFrom: f ? f.toISOString() : null,
      dateTo: t ? new Date(t.getTime() + DAY_MS).toISOString() : null,
      invalid: false,
    };
  }
  const days = PRESET_DAYS[preset];
  return {
    dateFrom: new Date(now.getTime() - days * DAY_MS).toISOString(),
    dateTo: null,
    invalid: false,
  };
}

export type TimelineFilters = {
  /** Normalized raw search text (trimmed, capped). */
  q: string;
  reference: ParsedReference;
  type: EventTypeFilter;
  range: DatePreset;
  from: string | null;
  to: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** True when a custom range was requested but unparseable / from>to (caller shows a notice, falls back to all). */
  invalidRange: boolean;
  /** True when any filter differs from the defaults → the History tools disclosure starts open. */
  active: boolean;
};

const MAX_Q = 32;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Validate + normalize raw URL search params into {@link TimelineFilters}. `now` is injected for date presets. */
export function parseTimelineFilters(
  params: Record<string, string | string[] | undefined>,
  now: Date
): TimelineFilters {
  const q = first(params.q).trim().slice(0, MAX_Q);
  const rawType = first(params.type) as EventTypeFilter;
  const type = EVENT_TYPES.includes(rawType) ? rawType : "all";
  const rawRange = first(params.range) as DatePreset;
  const range = DATE_PRESETS.includes(rawRange) ? rawRange : "all";
  const from = first(params.from) || null;
  const to = first(params.to) || null;

  const resolved = datePresetToRange(range, from, to, now);

  return {
    q,
    reference: parseReferenceQuery(q),
    type,
    range,
    from,
    to,
    dateFrom: resolved.dateFrom,
    dateTo: resolved.dateTo,
    invalidRange: resolved.invalid,
    active: q !== "" || type !== "all" || range !== "all",
  };
}
