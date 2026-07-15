import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Client components → asserted structurally (Phase 3C.8): explicit Load-more, no auto-loading, URL-driven filters.
const here = dirname(fileURLToPath(import.meta.url));
const list = readFileSync(resolve(here, "timeline-list.tsx"), "utf8");
const filters = readFileSync(resolve(here, "timeline-filters.tsx"), "utf8");

describe("timeline-list — explicit Load more (Part F)", () => {
  it("has NO automatic infinite scroll / polling / refresh loop", () => {
    expect(list).not.toContain("IntersectionObserver");
    expect(list).not.toContain("setInterval");
    expect(list).not.toContain("router.refresh");
  });

  it("loads one page per click via the server action and guards double-clicks", () => {
    expect(list).toContain("loadMoreAssetTimeline");
    expect(list).toContain("if (pending || !hasMore) return");
    expect(list).toContain("Load 50 more");
  });

  it("appends events and keeps prior rows on failure with an inline retry", () => {
    expect(list).toContain("[...prev, ...res.events]");
    expect(list).toContain('role="alert"');
    expect(list).toContain("History could not be loaded. Try again.");
  });

  it("shows the quiet end state and a pending status", () => {
    expect(list).toContain("End of recorded history");
    expect(list).toContain("Loading more history…");
    expect(list).toContain('role="status"');
  });

  it("surfaces rental rows with the reference + a View session evidence action (Part I)", () => {
    expect(list).toContain("sessionRef");
    expect(list).toContain("View session evidence");
    expect(list).toContain("sessionEvidenceHref");
  });
});

describe("timeline-filters — disclosure + URL params (Part G)", () => {
  it("is a details disclosure, open only when filters are active", () => {
    expect(filters).toContain("<details");
    expect(filters).toContain("open={filters.active || undefined}");
  });

  it("submits as a GET form to the current path (bookmarkable, resets pagination)", () => {
    expect(filters).toContain('method="get"');
    expect(filters).toContain("action={pathname}");
    expect(filters).toContain("Clear");
  });

  it("offers the reference search, event-type, and date-range controls", () => {
    expect(filters).toContain("Search RNT or SUB reference");
    expect(filters).toContain('name="type"');
    expect(filters).toContain('name="range"');
    expect(filters).toContain('name="from"');
    expect(filters).toContain('name="to"');
  });
});
