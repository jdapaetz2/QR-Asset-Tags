/**
 * Engineering Phase E1 — read-only snapshots of one tenant, shared by the archive exporter and the reset planner.
 *
 * Two readers that produce the SAME JSON for the same rows (the local rehearsal proves the hashes equal):
 *   - PostgREST with the service role (hosted targets): the client is wrapped so only SELECTs, Storage listings and
 *     Storage downloads exist;
 *   - pg with `to_jsonb` in a UTC session (loopback targets only: the local stack and the standalone container).
 * Rows are sorted by id. scan_events are read up to the snapshot instant T0 (scans after it are new visitor activity).
 */
import { sortRows } from "./showcase-archive.mjs";
import { scopeWhere } from "./tenant-graph.mjs";

export const PAGE = 1000;
const ID_CHUNK = 100;
const MAX_ROWS = 300_000;
const IDENTITY_COLUMNS = "id, auth_user_id, role, organization_id, status";

const q = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

// ---------------------------------------------------------------------------------------------------------------------
// PostgREST (hosted)
// ---------------------------------------------------------------------------------------------------------------------

/** The target's live PostgREST OpenAPI document (a GET; compared with the tracked graph before anything is read). */
export async function fetchOpenApi(url, key) {
  const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/`, {
    method: "GET",
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
  });
  if (!res.ok) throw new Error(`could not read the target's PostgREST schema (HTTP ${res.status})`);
  return res.json();
}

/** The only database surface the hosted readers get: reads. */
export function readOnlyClient(db) {
  return {
    page: (table, columns, scope, after) => {
      let query = scope(db.from(table).select(columns)).order("id", { ascending: true }).limit(PAGE);
      if (after) query = query.gt("id", after);
      return query;
    },
    list: (bucket, prefix, offset) => db.storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
    download: (bucket, objectPath) => db.storage.from(bucket).download(objectPath),
  };
}

export async function readAll(client, table, scope, columns = "*") {
  const rows = [];
  let after = null;
  for (;;) {
    const { data, error } = await client.page(table, columns, scope, after);
    if (error) throw new Error(`could not read ${table} (${error.message})`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
    after = data[data.length - 1].id;
    if (rows.length > MAX_ROWS) throw new Error(`${table} holds more rows than this tool reads`);
  }
}

/** Every scoped table's rows through PostgREST; scan_events up to T0 only. */
export async function postgrestTables(client, graph, orgId, t0) {
  const tables = {};
  for (const table of graph.insert_order) {
    const info = graph.classes[table];
    if (info.class === "organization") tables[table] = await readAll(client, table, (x) => x.eq("id", orgId));
    else if (info.class === "tenant" && table === "scan_events") {
      tables[table] = await readAll(client, table, (x) => x.eq("organization_id", orgId).lte("scanned_at", t0));
    } else if (info.class === "tenant") tables[table] = await readAll(client, table, (x) => x.eq("organization_id", orgId));
  }
  for (const table of graph.insert_order.filter((t) => graph.classes[t].class === "tenant-child")) {
    const { parent, column } = graph.classes[table].scope;
    const parentIds = (tables[parent] ?? []).map((r) => r.id);
    const rows = [];
    for (let i = 0; i < parentIds.length; i += ID_CHUNK) {
      rows.push(...(await readAll(client, table, (x) => x.in(column, parentIds.slice(i, i + ID_CHUNK)))));
    }
    tables[table] = rows;
  }
  for (const table of Object.keys(tables)) tables[table] = sortRows(tables[table]);
  return tables;
}

/** Profiles the tenant's rows point at that are not the tenant's own (platform owners, normally). */
export function referencedProfileIds(graph, tables) {
  const ids = new Set();
  for (const [table, info] of Object.entries(graph.tables)) {
    if (!tables[table]) continue;
    for (const fk of info.foreign_keys ?? []) {
      if (fk.references.schema !== "public" || fk.references.table !== "profiles") continue;
      for (const row of tables[table]) if (row[fk.columns[0]]) ids.add(row[fk.columns[0]]);
    }
  }
  const own = new Set((tables.profiles ?? []).map((p) => p.id));
  return [...ids].filter((id) => !own.has(id)).sort();
}

export async function postgrestIdentity(client, graph, tables) {
  const ids = referencedProfileIds(graph, tables);
  const identity = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    identity.push(...(await readAll(client, "profiles", (x) => x.in("id", ids.slice(i, i + ID_CHUNK)), IDENTITY_COLUMNS)));
  }
  return { ids, identity: sortRows(identity) };
}

// ---------------------------------------------------------------------------------------------------------------------
// pg (loopback targets only; the caller has already loopback-checked the connection)
// ---------------------------------------------------------------------------------------------------------------------

async function assertUtc(pgClient) {
  const row = (await pgClient.query("show timezone")).rows[0] ?? {};
  if (String(row.TimeZone ?? row.timezone).toUpperCase() !== "UTC") throw new Error("a pg snapshot needs a UTC session (set timezone = 'UTC')");
}

/** The same tables as postgrestTables, through to_jsonb. `lock` adds FOR UPDATE (inside the caller's transaction). */
export async function pgTables(pgClient, graph, orgId, t0, { lock = false } = {}) {
  await assertUtc(pgClient);
  const tables = {};
  for (const table of graph.insert_order) {
    const extra = table === "scan_events" ? ` and t.scanned_at <= $2` : "";
    const params = table === "scan_events" ? [orgId, t0] : [orgId];
    const res = await pgClient.query(
      `select to_jsonb(t) as j from public.${q(table)} t where ${scopeWhere(table, graph.classes)}${extra} order by t.id${lock ? " for update" : ""}`,
      params
    );
    tables[table] = res.rows.map((r) => r.j);
  }
  return tables;
}

export async function pgIdentity(pgClient, graph, tables) {
  const ids = referencedProfileIds(graph, tables);
  if (ids.length === 0) return { ids, identity: [] };
  const res = await pgClient.query(`select ${IDENTITY_COLUMNS} from public.profiles where id = any($1::uuid[]) order by id`, [ids]);
  return { ids, identity: res.rows };
}
