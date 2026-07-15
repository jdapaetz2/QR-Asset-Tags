import { describe, expect, it } from "vitest";

import {
  encodeCursor,
  decodeCursor,
  isBelowCursor,
  parseReferenceQuery,
  uuidRangeFromHexPrefix,
  datePresetToRange,
  parseTimelineFilters,
} from "./cursor";

describe("cursor codec", () => {
  it("round-trips a cursor", () => {
    const c = { at: "2026-07-01T00:00:00.000Z", id: "abc00000-0000-0000-0000-000000000000" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("returns null for empty / malformed input", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("!!!not-base64!!!")).toBeNull();
    expect(decodeCursor(Buffer.from('{"at":1}', "utf8").toString("base64"))).toBeNull();
  });
});

describe("isBelowCursor (at desc, id desc)", () => {
  const cur = { at: "2026-07-05T00:00:00.000Z", id: "m" };
  it("no cursor → everything is below", () => {
    expect(isBelowCursor("2027-01-01T00:00:00Z", "z", null)).toBe(true);
  });
  it("older timestamp is below", () => {
    expect(isBelowCursor("2026-07-04T00:00:00.000Z", "z", cur)).toBe(true);
  });
  it("newer timestamp is not below", () => {
    expect(isBelowCursor("2026-07-06T00:00:00.000Z", "a", cur)).toBe(false);
  });
  it("same timestamp → tie-break by id desc", () => {
    expect(isBelowCursor(cur.at, "a", cur)).toBe(true); // "a" < "m"
    expect(isBelowCursor(cur.at, "m", cur)).toBe(false); // equal → already emitted
    expect(isBelowCursor(cur.at, "z", cur)).toBe(false); // "z" > "m"
  });
});

describe("parseReferenceQuery", () => {
  it("parses RNT and SUB case-insensitively with whitespace", () => {
    expect(parseReferenceQuery("  rnt-2026-b35fb4 ")).toEqual({
      kind: "RNT",
      year: 2026,
      hex6: "b35fb4",
    });
    expect(parseReferenceQuery("SUB-2025-1A2B3C")).toEqual({
      kind: "SUB",
      year: 2025,
      hex6: "1a2b3c",
    });
  });
  it("non-canonical input → none", () => {
    for (const q of ["", "hello", "RNT-2026", "RNT-2026-XYZ123", "RNT-26-b35fb4"]) {
      expect(parseReferenceQuery(q).kind).toBe("none");
    }
  });
});

describe("uuidRangeFromHexPrefix", () => {
  it("brackets all uuids starting with the 6-hex prefix", () => {
    const { lo, hi } = uuidRangeFromHexPrefix("b35fb4");
    expect(lo).toBe("b35fb400-0000-0000-0000-000000000000");
    expect(hi).toBe("b35fb4ff-ffff-ffff-ffff-ffffffffffff");
    // A real uuid with that prefix falls inside the range.
    const id = "b35fb4a1-1234-4321-8888-abcabcabcabc";
    expect(lo <= id && id <= hi).toBe(true);
  });
});

describe("datePresetToRange", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  it("all → open window", () => {
    expect(datePresetToRange("all", null, null, now)).toEqual({
      dateFrom: null,
      dateTo: null,
      invalid: false,
    });
  });
  it("7/30/90/1y → lower bound now-Nd, open upper", () => {
    expect(datePresetToRange("7d", null, null, now).dateFrom).toBe("2026-07-08T12:00:00.000Z");
    expect(datePresetToRange("30d", null, null, now).dateFrom).toBe("2026-06-15T12:00:00.000Z");
    expect(datePresetToRange("1y", null, null, now).dateFrom).toBe("2025-07-15T12:00:00.000Z");
    expect(datePresetToRange("90d", null, null, now).dateTo).toBeNull();
  });
  it("custom valid range → inclusive day window (to is exclusive next-day)", () => {
    const r = datePresetToRange("custom", "2026-01-01", "2026-01-31", now);
    expect(r.dateFrom).toBe("2026-01-01T00:00:00.000Z");
    expect(r.dateTo).toBe("2026-02-01T00:00:00.000Z");
    expect(r.invalid).toBe(false);
  });
  it("custom from>to → invalid", () => {
    expect(datePresetToRange("custom", "2026-02-01", "2026-01-01", now).invalid).toBe(true);
  });
  it("custom unparseable → invalid", () => {
    expect(datePresetToRange("custom", "nope", "2026-13-40", now).invalid).toBe(true);
  });
});

describe("parseTimelineFilters", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  it("defaults to inactive all/all with blank search", () => {
    const f = parseTimelineFilters({}, now);
    expect(f).toMatchObject({ q: "", type: "all", range: "all", active: false });
    expect(f.reference.kind).toBe("none");
  });
  it("whitelists unknown type/range back to all", () => {
    const f = parseTimelineFilters({ type: "bogus", range: "weird" }, now);
    expect(f.type).toBe("all");
    expect(f.range).toBe("all");
  });
  it("caps the search string at 32 chars and marks active", () => {
    const f = parseTimelineFilters({ q: "x".repeat(80) }, now);
    expect(f.q.length).toBe(32);
    expect(f.active).toBe(true);
  });
  it("flags an invalid custom range and falls back to an open window", () => {
    const f = parseTimelineFilters({ range: "custom", from: "2026-02-01", to: "2026-01-01" }, now);
    expect(f.invalidRange).toBe(true);
    expect(f.dateFrom).toBeNull();
    expect(f.dateTo).toBeNull();
    expect(f.active).toBe(true); // range=custom is non-default
  });
  it("parses a reference query into the reference field", () => {
    const f = parseTimelineFilters({ q: "RNT-2026-B35FB4" }, now);
    expect(f.reference).toEqual({ kind: "RNT", year: 2026, hex6: "b35fb4" });
  });
});
