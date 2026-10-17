import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readOnlyClient, referencedProfileIds } from "./tenant-snapshot.mjs";

// Phase E1: the exporter and the shared snapshot reader are read-only on the source by construction. This scans their
// source for any write surface; Storage `download` and `list` and PostgREST `select` are the only calls allowed.

const SOURCES = ["./tenant-snapshot.mjs", "../phase-e/showcase-archive.mjs"];
const WRITES = /\.(insert|update|upsert|delete|remove|upload|move|copy|rpc|createSignedUrl|createSignedUrls|createBucket|updateBucket|emptyBucket|deleteBucket)\(|\bauth\.admin\b|\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\b/;

describe("read-only source", () => {
  it("has no write call in the exporter or the snapshot reader", () => {
    for (const rel of SOURCES) {
      // Hashing (createHash(...).update(bytes)) is the one `.update(` that is not a write.
      const text = readFileSync(new URL(rel, import.meta.url), "utf8").replace(/createHash\([^)]*\)\s*\.update\(/g, "");
      expect(text.match(WRITES)?.[0] ?? null, rel).toBeNull();
    }
  });

  it("exposes only page, list and download", () => {
    const calls = [];
    const chain = new Proxy(() => chain, { get: (_, prop) => (prop === "then" ? undefined : () => (calls.push(prop), chain)) });
    const client = readOnlyClient({ from: () => chain, storage: { from: () => chain } });
    expect(Object.keys(client).sort()).toEqual(["download", "list", "page"]);
    client.page("assets", "*", (q) => q.eq("organization_id", "x"), null);
    client.list("submissions", "org/x", 0);
    client.download("submissions", "org/x/y.jpg");
    expect(calls).toEqual(["select", "eq", "order", "limit", "list", "download"]);
  });
});

describe("referencedProfileIds", () => {
  it("collects profiles the tenant's rows point at, minus the tenant's own", () => {
    const graph = JSON.parse(readFileSync(new URL("../../docs/phase-e/manifests/tenant-dependency-graph.json", import.meta.url), "utf8"));
    const own = "e1b00000-0000-4000-8000-000000000001";
    const owner = "e1b00000-0000-4000-8000-000000000002";
    const tables = {
      profiles: [{ id: own }],
      tag_requests: [{ id: "t", requested_by_profile_id: own, platform_viewed_by_profile_id: owner }],
      activity_log: [{ id: "a", actor_user_id: owner }],
    };
    expect(referencedProfileIds(graph, tables)).toEqual([owner]);
  });
});
