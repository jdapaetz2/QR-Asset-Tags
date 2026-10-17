import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  GraphError,
  SHARED_TABLES,
  alwaysTriggers,
  classifyTables,
  compareWithOpenApi,
  deleteOrder,
  insertOrder,
  integrityChecks,
  openApiTables,
  scopeWhere,
} from "./tenant-graph.mjs";

// The Phase E1 tenant dependency graph (scripts/lib/tenant-graph.mjs) against the tracked graph generated from the
// local catalog, plus small synthetic catalogs for the refusals.

const GRAPH = JSON.parse(readFileSync(new URL("../../docs/phase-e/manifests/tenant-dependency-graph.json", import.meta.url), "utf8"));

const fk = (column, table, onDelete = "cascade", schema = "public") => ({
  columns: [column],
  references: { schema, table, columns: ["id"] },
  on_delete: onDelete,
});
const col = (name, nullable = false) => ({ name, nullable });
const catalog = (tables) => ({ tables });

describe("the tracked graph", () => {
  it("is internally consistent: graph_sha256 covers the body", () => {
    const { graph_sha256: sha, ...body } = GRAPH;
    expect(createHash("sha256").update(JSON.stringify(body)).digest("hex")).toBe(sha);
  });

  it("classifies every public table, with rate_limit_counters shared and tag_request_assets a tenant child", () => {
    const classes = classifyTables(GRAPH);
    expect(Object.keys(classes).sort()).toEqual(Object.keys(GRAPH.tables).sort());
    expect(classes.organizations.class).toBe("organization");
    expect(classes.rate_limit_counters.class).toBe("shared");
    expect(classes.rate_limit_counters.reason).toBe(SHARED_TABLES.rate_limit_counters);
    expect(classes.tag_request_assets.class).toBe("tenant-child");
    // System page templates have a NULL organization_id, so a tenant scope never selects them.
    expect(classes.equipment_page_templates).toMatchObject({ class: "tenant", nullableOrganization: true });
    expect(classes).toEqual(GRAPH.classes);
  });

  it("orders inserts so every parent precedes its children, breaking only the asset/session cycle", () => {
    const order = insertOrder(GRAPH);
    expect(order).toEqual(GRAPH.insert_order);
    expect(order[0]).toBe("organizations");
    expect(order).not.toContain("rate_limit_counters");
    const at = (t) => order.indexOf(t);
    expect(at("assets")).toBeLessThan(at("asset_rental_sessions"));
    expect(at("assets")).toBeLessThan(at("qr_links"));
    expect(at("qr_links")).toBeLessThan(at("scan_events"));
    expect(at("asset_rental_sessions")).toBeLessThan(at("form_submissions"));
    expect(at("tag_requests")).toBeLessThan(at("tag_request_assets"));
    expect(deleteOrder(GRAPH)).toEqual([...order].reverse());
  });

  it("generates parameterized integrity checks that never embed an organization id", () => {
    const checks = integrityChecks(GRAPH);
    expect(checks.length).toBeGreaterThan(30);
    for (const check of checks) {
      expect(check.sql).toMatch(/\$1/);
      expect(check.sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(check.sql).toMatch(/^select count\(\*\)::int as n from /);
    }
    const names = checks.map((c) => c.name);
    expect(names).toContain("fk assets.active_rental_session_id → public.asset_rental_sessions");
    expect(names).toContain("fk profiles.auth_user_id → auth.users");
    expect(names).toContain("same-org form_submissions.rental_session_id");
    expect(names).toContain("same-org tag_request_assets.tag_request_id (via assets)");
    expect(names).toContain("inbound tag_request_assets.tag_request_id from other tenants");
    expect(names).toContain("inbound qr_links.asset_id from other tenants");
  });

  it("has no ENABLE ALWAYS trigger (a replica-mode restore would still fire it)", () => {
    expect(alwaysTriggers(GRAPH)).toEqual([]);
  });
});

describe("classifyTables refusals", () => {
  const base = {
    organizations: { columns: [col("id")], foreign_keys: [] },
    assets: { columns: [col("id"), col("organization_id")], foreign_keys: [fk("organization_id", "organizations")] },
  };

  it("refuses a table that is neither tenant-scoped nor listed as shared", () => {
    const unknown = catalog({ ...base, mystery_cache: { columns: [col("id"), col("key")], foreign_keys: [] } });
    expect(() => classifyTables(unknown)).toThrow(GraphError);
    expect(() => classifyTables(unknown)).toThrow(/mystery_cache .* unrecognised dependency/);
  });

  it("accepts a child with no organization_id only through a CASCADE tenant parent", () => {
    const child = { columns: [col("id"), col("asset_id")], foreign_keys: [fk("asset_id", "assets", "cascade")] };
    expect(classifyTables(catalog({ ...base, asset_notes: child })).asset_notes).toEqual({
      class: "tenant-child",
      scope: { via: "parent", parent: "assets", column: "asset_id" },
    });
    const weak = { columns: [col("id"), col("asset_id")], foreign_keys: [fk("asset_id", "assets", "set null")] };
    expect(() => classifyTables(catalog({ ...base, asset_notes: weak }))).toThrow(GraphError);
  });
});

describe("insertOrder refusals", () => {
  it("refuses a foreign-key cycle that has no known deferred column", () => {
    const cyclic = catalog({
      organizations: { columns: [col("id")], foreign_keys: [] },
      a: { columns: [col("id"), col("organization_id"), col("b_id", true)], foreign_keys: [fk("organization_id", "organizations"), fk("b_id", "b", "set null")] },
      b: { columns: [col("id"), col("organization_id"), col("a_id")], foreign_keys: [fk("organization_id", "organizations"), fk("a_id", "a")] },
    });
    expect(() => insertOrder(cyclic)).toThrow(/cycle with no known deferred column among: a, b/);
  });

  it("ignores self-references when ordering", () => {
    const self = catalog({
      organizations: { columns: [col("id")], foreign_keys: [] },
      links: { columns: [col("id"), col("organization_id"), col("supersedes", true)], foreign_keys: [fk("organization_id", "organizations"), fk("supersedes", "links", "set null")] },
    });
    expect(insertOrder(self)).toEqual(["organizations", "links"]);
  });
});

describe("scopeWhere", () => {
  const classes = classifyTables(GRAPH);
  it("selects by id, organization_id or the parent's organization", () => {
    expect(scopeWhere("organizations", classes)).toBe("t.id = $1");
    expect(scopeWhere("assets", classes)).toBe("t.organization_id = $1");
    expect(scopeWhere("tag_request_assets", classes, "x")).toBe(
      `x."asset_id" in (select p.id from public."assets" p where p.organization_id = $1)`
    );
  });
  it("refuses a shared or unknown table", () => {
    expect(() => scopeWhere("rate_limit_counters", classes)).toThrow(GraphError);
    expect(() => scopeWhere("nope", classes)).toThrow(GraphError);
  });
});

describe("compareWithOpenApi", () => {
  it("passes for the graph's own tables and columns", () => {
    const live = Object.fromEntries(Object.entries(GRAPH.tables).map(([t, info]) => [t, info.columns.map((c) => c.name)]));
    expect(compareWithOpenApi(GRAPH, live)).toEqual([]);
  });

  it("reports differences in both directions", () => {
    const live = Object.fromEntries(Object.entries(GRAPH.tables).map(([t, info]) => [t, info.columns.map((c) => c.name)]));
    live.surprise_table = ["id"];
    delete live.scan_events;
    live.assets = [...live.assets.filter((c) => c !== "category"), "new_column"];
    const problems = compareWithOpenApi(GRAPH, live);
    expect(problems).toContain("target has table surprise_table that the graph does not know");
    expect(problems).toContain("graph table scan_events is missing on the target");
    expect(problems).toContain("target has column assets.new_column that the graph does not know");
    expect(problems).toContain("graph column assets.category is missing on the target");
  });

  it("reads table columns from a PostgREST (Swagger 2) document", () => {
    const doc = { definitions: { assets: { properties: { id: {}, asset_code: {} } }, empty: {} } };
    expect(openApiTables(doc)).toEqual({ assets: ["id", "asset_code"], empty: [] });
    expect(openApiTables(null)).toEqual({});
  });
});

describe("alwaysTriggers", () => {
  it("lists triggers marked ENABLE ALWAYS", () => {
    const withAlways = catalog({ t: { triggers: [{ name: "ok", enabled: "O" }, { name: "loud", enabled: "A" }] } });
    expect(alwaysTriggers(withAlways)).toEqual(["t.loud"]);
  });
});
