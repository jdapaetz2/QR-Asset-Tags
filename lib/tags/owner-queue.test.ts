import { describe, expect, it } from "vitest";

import { ownerTagRequestQueue, unviewedCountByOrg } from "./tag-requests";

// Migration 0035 took `platform_viewed_at` out of `authenticated`'s column grant, so the owner queue merges the viewed
// state from `owner_tag_request_internal` and applies the unviewed filter and order in the app. The order must match
// what the database produced before: unviewed first, then viewed oldest-first, ties newest request first.

const rows = [
  { id: "a", created_at: "2026-09-01T10:00:00Z" },
  { id: "b", created_at: "2026-09-05T10:00:00Z" },
  { id: "c", created_at: "2026-09-03T10:00:00Z" },
  { id: "d", created_at: "2026-09-04T10:00:00Z" },
  { id: "e", created_at: "2026-09-02T10:00:00Z" },
];

const internal = [
  { id: "a", platform_viewed_at: "2026-09-08T09:00:00Z" },
  { id: "b", platform_viewed_at: null },
  { id: "c", platform_viewed_at: "2026-09-06T09:00:00Z" },
  { id: "d", platform_viewed_at: null },
  { id: "e", platform_viewed_at: "2026-09-06T09:00:00Z" },
];

describe("ownerTagRequestQueue", () => {
  it("orders unviewed first (newest first), then viewed oldest-first with ties newest first", () => {
    expect(ownerTagRequestQueue(rows, internal, "all").map((r) => r.id)).toEqual(["b", "d", "c", "e", "a"]);
  });

  it("merges the viewed timestamp onto each row", () => {
    const queue = ownerTagRequestQueue(rows, internal, "all");
    expect(queue.find((r) => r.id === "a")?.platform_viewed_at).toBe("2026-09-08T09:00:00Z");
    expect(queue.find((r) => r.id === "b")?.platform_viewed_at).toBeNull();
  });

  it("the unviewed filter keeps only requests the owner has not opened", () => {
    expect(ownerTagRequestQueue(rows, internal, "unviewed").map((r) => r.id)).toEqual(["b", "d"]);
  });

  it("treats a row without an internal record as unviewed, so pending work is never hidden", () => {
    const queue = ownerTagRequestQueue(rows, [], "unviewed");
    expect(queue).toHaveLength(5);
    expect(queue.every((r) => r.platform_viewed_at === null)).toBe(true);
  });

  it("does not mutate its inputs", () => {
    const copy = rows.map((r) => ({ ...r }));
    ownerTagRequestQueue(rows, internal, "all");
    expect(rows).toEqual(copy);
  });
});

describe("unviewedCountByOrg over the owner function's rows", () => {
  it("counts only unviewed requests per organization", () => {
    const counts = unviewedCountByOrg([
      { organization_id: "org-1", platform_viewed_at: null },
      { organization_id: "org-1", platform_viewed_at: "2026-09-06T09:00:00Z" },
      { organization_id: "org-1", platform_viewed_at: null },
      { organization_id: "org-2", platform_viewed_at: null },
    ]);
    expect(Object.fromEntries(counts)).toEqual({ "org-1": 2, "org-2": 1 });
  });
});
