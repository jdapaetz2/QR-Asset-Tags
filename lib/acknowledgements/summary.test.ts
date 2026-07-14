import { describe, expect, it } from "vitest";

import { summarizeAcknowledgements, type AcknowledgementRecord } from "./summary";

const rec = (over: Partial<AcknowledgementRecord>): AcknowledgementRecord => ({
  id: "a",
  name: "Renter",
  email: null,
  phone: null,
  statement: "I acknowledge…",
  acknowledged_at: "2026-07-01T00:00:00Z",
  ...over,
});

describe("summarizeAcknowledgements (Phase 3C.7)", () => {
  it("returns an empty, neutral summary for no rows", () => {
    for (const empty of [undefined, null, [] as AcknowledgementRecord[]]) {
      const s = summarizeAcknowledgements(empty);
      expect(s.count).toBe(0);
      expect(s.latest).toBeNull();
      expect(s.all).toEqual([]);
    }
  });

  it("surfaces the single record as the latest", () => {
    const s = summarizeAcknowledgements([rec({ id: "only", name: "Dana" })]);
    expect(s.count).toBe(1);
    expect(s.latest?.id).toBe("only");
    expect(s.latest?.name).toBe("Dana");
  });

  it("orders newest-first and picks the newest as latest regardless of input order", () => {
    const older = rec({ id: "old", acknowledged_at: "2026-07-01T00:00:00Z" });
    const newer = rec({ id: "new", acknowledged_at: "2026-07-10T00:00:00Z" });
    const s = summarizeAcknowledgements([older, newer]);
    expect(s.count).toBe(2);
    expect(s.latest?.id).toBe("new");
    expect(s.all.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("sorts rows without a timestamp last", () => {
    const dated = rec({ id: "dated", acknowledged_at: "2026-07-05T00:00:00Z" });
    const undatedRow = rec({ id: "undated", acknowledged_at: null });
    const s = summarizeAcknowledgements([undatedRow, dated]);
    expect(s.all.map((r) => r.id)).toEqual(["dated", "undated"]);
  });

  it("does not mutate the caller's array", () => {
    const rows = [rec({ id: "1", acknowledged_at: "2026-07-01T00:00:00Z" }), rec({ id: "2", acknowledged_at: "2026-07-09T00:00:00Z" })];
    const before = rows.map((r) => r.id);
    summarizeAcknowledgements(rows);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});
