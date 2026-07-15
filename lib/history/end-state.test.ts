import { describe, expect, it } from "vitest";

import { historyEndState } from "./end-state";

describe("historyEndState (Phase 3C.8.1)", () => {
  it("hasMore always wins → load-more", () => {
    expect(historyEndState({ hasMore: true, hasActiveFilters: false, itemCount: 50 })).toBe("load-more");
    expect(historyEndState({ hasMore: true, hasActiveFilters: true, itemCount: 0 })).toBe("load-more");
  });

  it("unfiltered final page with items → end-all", () => {
    expect(historyEndState({ hasMore: false, hasActiveFilters: false, itemCount: 12 })).toBe("end-all");
  });

  it("filtered final page with items → end-filtered (older records may exist outside the filter)", () => {
    expect(historyEndState({ hasMore: false, hasActiveFilters: true, itemCount: 12 })).toBe("end-filtered");
  });

  it("filtered with no items → empty-filtered", () => {
    expect(historyEndState({ hasMore: false, hasActiveFilters: true, itemCount: 0 })).toBe("empty-filtered");
  });

  it("unfiltered with no items → empty-none", () => {
    expect(historyEndState({ hasMore: false, hasActiveFilters: false, itemCount: 0 })).toBe("empty-none");
  });
});
