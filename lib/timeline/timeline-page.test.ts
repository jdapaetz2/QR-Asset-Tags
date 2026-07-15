import { describe, expect, it } from "vitest";

import {
  getAssetTimelinePage,
  type TimelineQueryClient,
  type SourceArgs,
  type SubRow,
  type AckRow,
  type RentalRow,
  type TagRow,
} from "./timeline-page";
import { parseTimelineFilters, decodeCursor } from "./cursor";

const NOW = new Date("2026-08-01T00:00:00.000Z");
const noFilters = () => parseTimelineFilters({}, NOW);

// A fake client that mirrors the SQL adapter's bounding over in-memory rows, so the merge/cursor logic is
// exercised end-to-end. Records every call's `limit` so we can assert each source stays bounded.
function makeClient(seed: {
  submissions?: SubRow[];
  acks?: AckRow[];
  tags?: TagRow[];
  rentals?: RentalRow[];
}) {
  const calls: { source: string; args: SourceArgs }[] = [];
  // Mirrors the SQL adapter: date bounds + STRICT keyset (ts < cursorAt OR (ts = cursorAt AND id < cursorId)),
  // ordered (ts desc, id desc), limited.
  const bound = <T extends { id: string }>(
    rows: T[],
    ts: (r: T) => string,
    args: SourceArgs,
    extra?: (r: T) => boolean
  ): T[] =>
    rows
      .filter((r) => (extra ? extra(r) : true))
      .filter((r) => (!args.dateFrom || ts(r) >= args.dateFrom) && (!args.dateTo || ts(r) < args.dateTo))
      .filter((r) =>
        !args.cursorAt || !args.cursorId
          ? true
          : ts(r) < args.cursorAt || (ts(r) === args.cursorAt && r.id < args.cursorId)
      )
      .filter((r) => (!args.idLo || !args.idHi || (r.id >= args.idLo && r.id <= args.idHi)))
      .sort((a, b) => ts(b).localeCompare(ts(a)) || b.id.localeCompare(a.id))
      .slice(0, args.limit);

  const client: TimelineQueryClient = {
    loadSubmissions: async (_a, args) => {
      calls.push({ source: "submissions", args });
      let rows = seed.submissions ?? [];
      if (args.formTypes) rows = rows.filter((r) => args.formTypes!.includes(r.form_type));
      return { data: bound(rows, (r) => r.created_at, args), error: null };
    },
    loadAcknowledgements: async (_a, args) => {
      calls.push({ source: "acks", args });
      return { data: bound(seed.acks ?? [], (r) => r.created_at, args), error: null };
    },
    loadTagRequests: async (_a, args) => {
      calls.push({ source: "tags", args });
      return { data: bound(seed.tags ?? [], (r) => r.created_at, args), error: null };
    },
    loadRentalStarted: async (_a, args) => {
      calls.push({ source: "rental_started", args });
      return { data: bound(seed.rentals ?? [], (r) => r.started_at, args), error: null };
    },
    loadRentalEnded: async (_a, args) => {
      calls.push({ source: "rental_ended", args });
      return {
        data: bound(seed.rentals ?? [], (r) => r.returned_at ?? "", args, (r) => r.returned_at != null),
        error: null,
      };
    },
  };
  return { client, calls };
}

const sub = (n: number): SubRow => ({
  id: `${n}0000000-0000-0000-0000-000000000000`,
  form_type: "damage_report",
  status: "new",
  created_at: `2026-06-${String(n).padStart(2, "0")}T00:00:00.000Z`,
  submitted_by_name: null,
  submission_origin: "public",
  submission_data_json: null,
  media_urls: [],
});

describe("getAssetTimelinePage (Phase 3C.8)", () => {
  it("caps the initial page at pageSize and reports hasMore", async () => {
    const submissions = Array.from({ length: 5 }, (_, i) => sub(i + 1));
    const { client } = makeClient({ submissions });
    const page = await getAssetTimelinePage({
      client,
      assetId: "a",
      assetCreatedAt: null,
      archivedAt: null,
      cursor: null,
      pageSize: 2,
      filters: noFilters(),
    });
    expect(page.events).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    // Newest first.
    expect(page.events[0].at > page.events[1].at).toBe(true);
  });

  it("bounds every source query with limit = pageSize + 1", async () => {
    const { client, calls } = makeClient({ submissions: [sub(1)] });
    await getAssetTimelinePage({
      client,
      assetId: "a",
      assetCreatedAt: null,
      archivedAt: null,
      cursor: null,
      pageSize: 10,
      filters: noFilters(),
    });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.args.limit).toBe(11);
  });

  it("pages through with no duplicates and no skips", async () => {
    const submissions = Array.from({ length: 5 }, (_, i) => sub(i + 1));
    const { client } = makeClient({ submissions });
    const seen: string[] = [];
    let cursor = null as ReturnType<typeof decodeCursor>;
    for (let i = 0; i < 5; i++) {
      const page = await getAssetTimelinePage({
        client,
        assetId: "a",
        assetCreatedAt: null,
        archivedAt: null,
        cursor,
        pageSize: 2,
        filters: noFilters(),
      });
      seen.push(...page.events.map((e) => e.key));
      if (!page.hasMore) break;
      cursor = decodeCursor(page.nextCursor);
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5); // no duplicates
  });

  it("orders equal-timestamp events deterministically across a page boundary", async () => {
    const at = "2026-06-15T00:00:00.000Z";
    const submissions: SubRow[] = ["a", "b", "c", "d"].map((c) => ({
      ...sub(1),
      id: `${c}0000000-0000-0000-0000-000000000000`,
      created_at: at,
    }));
    const { client } = makeClient({ submissions });
    const p1 = await getAssetTimelinePage({
      client,
      assetId: "a",
      assetCreatedAt: null,
      archivedAt: null,
      cursor: null,
      pageSize: 2,
      filters: noFilters(),
    });
    const p2 = await getAssetTimelinePage({
      client,
      assetId: "a",
      assetCreatedAt: null,
      archivedAt: null,
      cursor: decodeCursor(p1.nextCursor),
      pageSize: 2,
      filters: noFilters(),
    });
    const keys = [...p1.events, ...p2.events].map((e) => e.key);
    // key desc within the tie: d,c,b,a
    expect(keys).toEqual([
      "submission:d0000000-0000-0000-0000-000000000000",
      "submission:c0000000-0000-0000-0000-000000000000",
      "submission:b0000000-0000-0000-0000-000000000000",
      "submission:a0000000-0000-0000-0000-000000000000",
    ]);
    expect(new Set(keys).size).toBe(4);
  });

  it("RNT reference search queries only rental sources with a uuid range", async () => {
    const rental: RentalRow = {
      id: "b35fb4a1-0000-0000-0000-000000000000",
      status: "returned",
      rental_reference: null,
      renter_label: "Acme",
      started_at: "2026-05-01T00:00:00.000Z",
      returned_at: "2026-05-09T00:00:00.000Z",
    };
    const { client, calls } = makeClient({ submissions: [sub(1)], rentals: [rental] });
    const page = await getAssetTimelinePage({
      client,
      assetId: "a",
      assetCreatedAt: "2026-01-01T00:00:00.000Z",
      archivedAt: null,
      cursor: null,
      pageSize: 50,
      filters: parseTimelineFilters({ q: "RNT-2026-B35FB4" }, NOW),
    });
    const sources = calls.map((c) => c.source);
    expect(sources).toContain("rental_started");
    expect(sources).toContain("rental_ended");
    expect(sources).not.toContain("submissions");
    expect(sources).not.toContain("acks");
    const rentalCall = calls.find((c) => c.source === "rental_started")!;
    expect(rentalCall.args.idLo).toBe("b35fb400-0000-0000-0000-000000000000");
    // Only the matching session's events; no created/archived anchors during a reference search.
    expect(page.events.every((e) => e.kind === "rental_started" || e.kind === "rental_ended")).toBe(true);
  });

  it("SUB reference search queries only submissions with a uuid range", async () => {
    const { client, calls } = makeClient({ submissions: [sub(1)] });
    await getAssetTimelinePage({
      client,
      assetId: "a",
      assetCreatedAt: null,
      archivedAt: null,
      cursor: null,
      pageSize: 50,
      filters: parseTimelineFilters({ q: "SUB-2026-100000" }, NOW),
    });
    const sources = calls.map((c) => c.source);
    expect(sources).toEqual(["submissions"]);
    expect(calls[0].args.idLo).toBe("10000000-0000-0000-0000-000000000000");
  });

  it("a non-reference search returns an empty page (no %term% scan)", async () => {
    const { client, calls } = makeClient({ submissions: [sub(1)] });
    const page = await getAssetTimelinePage({
      client,
      assetId: "a",
      assetCreatedAt: null,
      archivedAt: null,
      cursor: null,
      pageSize: 50,
      filters: parseTimelineFilters({ q: "excavator" }, NOW),
    });
    expect(page.events).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(calls).toHaveLength(0); // never touched the DB
  });

  it("event-type filter restricts sources and passes formTypes", async () => {
    const { client, calls } = makeClient({ submissions: [sub(1)] });
    await getAssetTimelinePage({
      client,
      assetId: "a",
      assetCreatedAt: null,
      archivedAt: null,
      cursor: null,
      pageSize: 50,
      filters: parseTimelineFilters({ type: "inspections" }, NOW),
    });
    const sources = calls.map((c) => c.source);
    expect(sources).toEqual(["submissions"]);
    expect(calls[0].args.formTypes).toEqual(["return_checklist", "pre_use_inspection"]);
  });

  it("propagates a source error as a throw (never a silent partial page)", async () => {
    const client: TimelineQueryClient = {
      loadSubmissions: async () => ({ data: null, error: { message: "boom" } }),
      loadAcknowledgements: async () => ({ data: [], error: null }),
      loadTagRequests: async () => ({ data: [], error: null }),
      loadRentalStarted: async () => ({ data: [], error: null }),
      loadRentalEnded: async () => ({ data: [], error: null }),
    };
    await expect(
      getAssetTimelinePage({
        client,
        assetId: "a",
        assetCreatedAt: null,
        archivedAt: null,
        cursor: null,
        pageSize: 50,
        filters: noFilters(),
      })
    ).rejects.toThrow(/submissions/);
  });
});
