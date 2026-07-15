import { describe, expect, it } from "vitest";

import {
  getRentalSessionsPage,
  parseSessionFilters,
  sanitizePrefix,
  type SessionBrowserClient,
  type SessionQueryArgs,
} from "./session-browser";
import { decodeCursor } from "@/lib/timeline/cursor";

const NOW = new Date("2026-08-01T00:00:00.000Z");

type Row = {
  id: string;
  status: string;
  rental_reference: string | null;
  renter_label: string | null;
  started_at: string;
  returned_at: string | null;
  asset: { asset_code: string; asset_name: string } | null;
};

function makeClient(rows: Row[], assetIdsFor?: Record<string, string[]>) {
  const calls: SessionQueryArgs[] = [];
  const client: SessionBrowserClient = {
    findAssetIds: async (prefix) => ({ data: assetIdsFor?.[prefix] ?? [], error: null }),
    loadSessions: async (args) => {
      calls.push(args);
      let out = rows.slice();
      if (args.idLo && args.idHi) out = out.filter((r) => r.id >= args.idLo! && r.id <= args.idHi!);
      if (args.assetId) out = out; // asset_id not modeled on the row; trust the filter path
      if (args.status === "active") out = out.filter((r) => r.status === "active");
      else if (args.status === "returned")
        out = out.filter((r) => r.status === "returned" || r.status === "cancelled");
      if (args.dateFrom) out = out.filter((r) => r.started_at >= args.dateFrom!);
      if (args.dateTo) out = out.filter((r) => r.started_at < args.dateTo!);
      if (args.cursorAt && args.cursorId)
        out = out.filter(
          (r) =>
            r.started_at < args.cursorAt! ||
            (r.started_at === args.cursorAt! && r.id < args.cursorId!)
        );
      out.sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id));
      return { data: out.slice(0, args.limit), error: null };
    },
  };
  return { client, calls };
}

const row = (n: number, over: Partial<Row> = {}): Row => ({
  id: `${n}0000000-0000-0000-0000-000000000000`,
  status: "active",
  rental_reference: null,
  renter_label: "Acme",
  started_at: `2026-06-${String(n).padStart(2, "0")}T00:00:00.000Z`,
  returned_at: null,
  asset: { asset_code: "AT-1", asset_name: "Trailer" },
  ...over,
});

const filters = (params: Record<string, string> = {}) => parseSessionFilters(params, NOW);

describe("getRentalSessionsPage (Phase 3C.8)", () => {
  it("caps the initial page and derives the RNT reference + asset", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(i + 1));
    const { client } = makeClient(rows);
    const page = await getRentalSessionsPage({ client, cursor: null, pageSize: 2, filters: filters() });
    expect(page.sessions).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.sessions[0].reference).toMatch(/^RNT-2026-/);
    expect(page.sessions[0].asset?.asset_code).toBe("AT-1");
  });

  it("bounds the query with limit = pageSize + 1", async () => {
    const { client, calls } = makeClient([row(1)]);
    await getRentalSessionsPage({ client, cursor: null, pageSize: 10, filters: filters() });
    expect(calls[0].limit).toBe(11);
  });

  it("pages through with no duplicates and no skips", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(i + 1));
    const { client } = makeClient(rows);
    const seen: string[] = [];
    let cursor = null as ReturnType<typeof decodeCursor>;
    for (let i = 0; i < 5; i++) {
      const page = await getRentalSessionsPage({ client, cursor, pageSize: 2, filters: filters() });
      seen.push(...page.sessions.map((s) => s.id));
      if (!page.hasMore) break;
      cursor = decodeCursor(page.nextCursor);
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it("exact RNT reference search filters by uuid range", async () => {
    const target = row(1, { id: "b35fb4a1-0000-0000-0000-000000000000" });
    const { client, calls } = makeClient([target, row(2)]);
    const page = await getRentalSessionsPage({
      client,
      cursor: null,
      pageSize: 50,
      filters: filters({ q: "RNT-2026-B35FB4" }),
    });
    expect(calls[0].idLo).toBe("b35fb400-0000-0000-0000-000000000000");
    expect(page.sessions).toHaveLength(1);
    expect(page.sessions[0].id).toBe(target.id);
  });

  it("a SUB reference in the session browser matches nothing", async () => {
    const { client, calls } = makeClient([row(1)]);
    const page = await getRentalSessionsPage({
      client,
      cursor: null,
      pageSize: 50,
      filters: filters({ q: "SUB-2026-100000" }),
    });
    expect(page.sessions).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("status filters map to active / returned+cancelled", async () => {
    const rows = [row(1, { status: "active" }), row(2, { status: "returned" }), row(3, { status: "cancelled" })];
    const active = await getRentalSessionsPage({
      client: makeClient(rows).client,
      cursor: null,
      pageSize: 50,
      filters: filters({ status: "active" }),
    });
    expect(active.sessions.map((s) => s.status)).toEqual(["active"]);
    const returned = await getRentalSessionsPage({
      client: makeClient(rows).client,
      cursor: null,
      pageSize: 50,
      filters: filters({ status: "returned" }),
    });
    expect(returned.sessions.map((s) => s.status).sort()).toEqual(["cancelled", "returned"]);
  });

  it("an asset search with no matches short-circuits to empty", async () => {
    const { client, calls } = makeClient([row(1)], { zzz: [] });
    const page = await getRentalSessionsPage({
      client,
      cursor: null,
      pageSize: 50,
      filters: filters({ asset_q: "zzz" }),
    });
    expect(page.sessions).toEqual([]);
    expect(calls).toHaveLength(0); // never queried sessions
  });

  it("passes a date-range filter through", async () => {
    const { client, calls } = makeClient([row(1)]);
    await getRentalSessionsPage({
      client,
      cursor: null,
      pageSize: 50,
      filters: filters({ range: "30d" }),
    });
    expect(calls[0].dateFrom).toBe("2026-07-02T00:00:00.000Z");
  });
});

describe("parseSessionFilters + sanitizePrefix", () => {
  it("sanitizes prefixes to safe characters", () => {
    expect(sanitizePrefix("  Ex,ca(va)tor%  ")).toBe("Excavator");
    expect(sanitizePrefix("a".repeat(80)).length).toBe(40);
  });

  it("marks active when any filter is set and defaults otherwise", () => {
    expect(parseSessionFilters({}, NOW).active).toBe(false);
    expect(parseSessionFilters({ status: "active" }, NOW).active).toBe(true);
    expect(parseSessionFilters({ renter_q: "acme" }, NOW).renterSearch).toBe("acme");
    expect(parseSessionFilters({ asset: "abc" }, NOW).assetId).toBe("abc");
  });
});
