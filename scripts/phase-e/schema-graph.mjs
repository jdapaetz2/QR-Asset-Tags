#!/usr/bin/env node
/**
 * Engineering Phase E1 — derive the tenant dependency graph from the LOCAL database catalog.
 *
 *   npm.cmd run phase-e:graph:local            write docs/phase-e/manifests/tenant-dependency-graph.json
 *   npm.cmd run phase-e:graph:local -- --check exit 1 if the tracked file no longer matches the catalog
 *
 * The local stack applies the same migrations as staging and Production (docs/MIGRATION_LEDGER.md), so its catalog is
 * the schema those environments run; the exporter additionally compares this graph with each target's live PostgREST
 * definitions before it reads anything. Loopback only (scripts/lib/local-stack.mjs checks the API and DB URLs).
 * Reads the catalog only; writes nothing to the database. The output is deterministic (no timestamps).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { readLocalStackStatus } from "../lib/local-stack.mjs";
import {
  SHARED_TABLES,
  STORAGE_REFERENCE_COLUMNS,
  alwaysTriggers,
  classifyTables,
  deferredColumns,
  insertOrder,
} from "../lib/tenant-graph.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(REPO, "docs", "phase-e", "manifests", "tenant-dependency-graph.json");
const ON_ACTION = { a: "no action", r: "restrict", c: "cascade", n: "set null", d: "set default" };
const check = process.argv.slice(2).includes("--check");

function triggerShape(tgtype) {
  return {
    level: tgtype & 1 ? "row" : "statement",
    timing: tgtype & 64 ? "INSTEAD OF" : tgtype & 2 ? "BEFORE" : "AFTER",
    events: [tgtype & 4 && "INSERT", tgtype & 16 && "UPDATE", tgtype & 8 && "DELETE", tgtype & 32 && "TRUNCATE"].filter(Boolean),
  };
}

async function readCatalog(client) {
  const tables = {};
  const t = await client.query(
    `select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname`
  );
  for (const row of t.rows) tables[row.name] = { rls: row.rls, columns: [], primary_key: [], foreign_keys: [], unique: [], checks: [], triggers: [] };

  const cols = await client.query(
    `select table_name, column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns
     where table_schema = 'public' order by table_name, ordinal_position`
  );
  for (const c of cols.rows) {
    tables[c.table_name]?.columns.push({
      name: c.column_name,
      type: c.data_type === "USER-DEFINED" || c.data_type === "ARRAY" ? c.udt_name : c.data_type,
      nullable: c.is_nullable === "YES",
      default: c.column_default,
    });
  }

  const cons = await client.query(
    `select con.conname as name, con.contype as kind, cl.relname as tbl, pg_get_constraintdef(con.oid) as def,
       (select array_agg(a.attname::text order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols,
       fn.nspname as ref_schema, fcl.relname as ref_table,
       (select array_agg(a.attname::text order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as ref_cols,
       con.confdeltype as on_delete, con.confupdtype as on_update, con.condeferrable as deferrable
     from pg_constraint con join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
     left join pg_class fcl on fcl.oid = con.confrelid left join pg_namespace fn on fn.oid = fcl.relnamespace
     where n.nspname = 'public' order by cl.relname, con.conname`
  );
  for (const c of cons.rows) {
    const table = tables[c.tbl];
    if (!table) continue;
    if (c.kind === "p") table.primary_key = c.cols;
    else if (c.kind === "f") {
      table.foreign_keys.push({
        name: c.name,
        columns: c.cols,
        references: { schema: c.ref_schema, table: c.ref_table, columns: c.ref_cols },
        on_delete: ON_ACTION[c.on_delete] ?? c.on_delete,
        on_update: ON_ACTION[c.on_update] ?? c.on_update,
        deferrable: c.deferrable,
      });
    } else if (c.kind === "c") table.checks.push({ name: c.name, definition: c.def });
  }

  const idx = await client.query(
    `select cl.relname as tbl, i.relname as name, ix.indisprimary as is_primary, pg_get_expr(ix.indpred, ix.indrelid) as predicate,
       (select array_agg(a.attname::text order by k.ord) from unnest(ix.indkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = ix.indrelid and a.attnum = k.attnum) as cols
     from pg_index ix join pg_class i on i.oid = ix.indexrelid join pg_class cl on cl.oid = ix.indrelid
     join pg_namespace n on n.oid = cl.relnamespace where n.nspname = 'public' and ix.indisunique order by cl.relname, i.relname`
  );
  for (const u of idx.rows) {
    if (u.is_primary || !tables[u.tbl]) continue;
    tables[u.tbl].unique.push({ name: u.name, columns: u.cols ?? [], predicate: u.predicate });
  }

  const trg = await client.query(
    `select cl.relname as tbl, t.tgname as name, t.tgenabled as enabled, t.tgtype as tgtype, pn.nspname || '.' || p.proname as fn
     from pg_trigger t join pg_class cl on cl.oid = t.tgrelid join pg_namespace n on n.oid = cl.relnamespace
     join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
     where n.nspname = 'public' and not t.tgisinternal order by cl.relname, t.tgname`
  );
  for (const tr of trg.rows) {
    tables[tr.tbl]?.triggers.push({ name: tr.name, ...triggerShape(tr.tgtype), function: tr.fn, enabled: tr.enabled });
  }

  const mig = await client.query(`select version, name from supabase_migrations.schema_migrations order by version`);
  return { tables, migrations: mig.rows.map((m) => `${m.version}${m.name ? `_${m.name}` : ""}`) };
}

function buildGraph(catalog) {
  const classes = classifyTables(catalog);
  const order = insertOrder(catalog, classes);
  const always = alwaysTriggers(catalog);
  const body = {
    schema: "mulemark.phase-e.tenant-dependency-graph/v1",
    generated_from: "local database catalog after supabase/migrations were applied (scripts/phase-e/schema-graph.mjs)",
    migrations: catalog.migrations,
    classes,
    insert_order: order,
    delete_order: [...order].reverse(),
    deferred_columns: deferredColumns(),
    shared_tables: SHARED_TABLES,
    shared_records: {
      "auth.users": "referenced by profiles.auth_user_id; never copied — a restore recreates local users with the archived ids",
      "platform-owner profiles": "organization_id null; referenced by tag_requests.platform_viewed_by_profile_id and possibly sessions; archived as identity references only",
      "equipment_page_templates with organization_id null": "system rows; outside every tenant scope",
      "storage.buckets": "bucket configuration; never copied",
      "supabase_migrations.schema_migrations": "migration history; never copied",
    },
    storage_reference_columns: STORAGE_REFERENCE_COLUMNS,
    always_triggers: always,
    tables: catalog.tables,
  };
  const graph_sha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, graph_sha256 };
}

async function main() {
  const stack = readLocalStackStatus(REPO);
  const client = new pg.Client({ connectionString: stack.dbUrl });
  await client.connect();
  let graph;
  try {
    graph = buildGraph(await readCatalog(client));
  } finally {
    await client.end();
  }
  if (graph.always_triggers.length > 0) {
    console.error(`[schema-graph] triggers marked ENABLE ALWAYS would fire during an exact restore: ${graph.always_triggers.join(", ")}`);
    process.exitCode = 1;
  }
  const serialized = `${JSON.stringify(graph, null, 2)}\n`;
  if (check) {
    let tracked = "";
    try {
      tracked = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");
    } catch {
      tracked = "";
    }
    const same = tracked === serialized;
    console.log(`[schema-graph] tracked graph ${same ? "matches" : "DOES NOT MATCH"} the local catalog (graph ${graph.graph_sha256.slice(0, 12)})`);
    if (!same) process.exitCode = 1;
    return;
  }
  writeFileSync(OUT, serialized);
  const counts = Object.values(graph.classes).reduce((acc, c) => ((acc[c.class] = (acc[c.class] ?? 0) + 1), acc), {});
  console.log(`[schema-graph] wrote docs/phase-e/manifests/tenant-dependency-graph.json — ${Object.keys(graph.tables).length} tables ${JSON.stringify(counts)}, ${graph.migrations.length} migrations, graph ${graph.graph_sha256.slice(0, 12)}`);
}

try {
  await main();
} catch (err) {
  console.error(`[schema-graph] stopped: ${String(err?.message ?? err).split("\n")[0].slice(0, 240)}`);
  process.exitCode = 1;
}
