/**
 * Engineering Phase E1 — the tenant dependency graph. Pure: no I/O.
 *
 * The graph is DERIVED from the database catalog (scripts/phase-e/schema-graph.mjs reads it from the local stack,
 * which applies the same migrations as staging and Production), never from a remembered table list. This module
 * classifies every public table, computes a foreign-key-safe order, generates the integrity checks a restore must pass,
 * and refuses anything it cannot classify.
 *
 * Classes:
 *   organization  the organizations table itself;
 *   tenant        has organization_id referencing organizations (rows with a NULL organization_id, such as system
 *                 page templates, are shared and never in a tenant scope);
 *   tenant-child  no organization_id, but every row hangs off a tenant parent (tag_request_assets);
 *   shared        explicitly listed in SHARED_TABLES with the reason it is never copied or deleted per tenant.
 */

/** Tables that belong to no tenant, with the reason. A public table that is not tenant-scoped must be listed here. */
export const SHARED_TABLES = Object.freeze({
  rate_limit_counters:
    "salted hash keys with no organization column and no id; short-lived (60 s / 3600 s windows); never archived or restored",
});

/** Columns that store Storage paths or Storage URLs, by table. The reference scanner also sweeps every text/json value. */
export const STORAGE_REFERENCE_COLUMNS = Object.freeze({
  documents: ["storage_path"],
  form_submissions: ["media_urls", "submission_data_json"],
  assets: ["cover_image_url"],
  organizations: ["logo_url"],
});

/** Foreign keys a restore inserts as NULL first and sets afterwards, because they close a cycle with no deferrable FK. */
const KNOWN_DEFERRED = Object.freeze({ assets: ["active_rental_session_id"] });

export class GraphError extends Error {}

const fkTargetsOrganizations = (fk) => fk.references.schema === "public" && fk.references.table === "organizations";

/**
 * Classify every public table. Throws GraphError for a table it cannot place — an unrecognised dependency is a blocker.
 * @param {object} catalog  the JSON written by schema-graph.mjs
 */
export function classifyTables(catalog) {
  const tables = catalog.tables ?? {};
  const out = {};
  for (const [name, table] of Object.entries(tables)) {
    if (name === "organizations") {
      out[name] = { class: "organization", scope: { via: "id" } };
      continue;
    }
    if (SHARED_TABLES[name]) {
      out[name] = { class: "shared", reason: SHARED_TABLES[name] };
      continue;
    }
    const orgFk = (table.foreign_keys ?? []).find(
      (fk) => fk.columns.length === 1 && fk.columns[0] === "organization_id" && fkTargetsOrganizations(fk)
    );
    if (orgFk) {
      out[name] = { class: "tenant", scope: { via: "organization_id" }, nullableOrganization: columnNullable(table, "organization_id") };
      continue;
    }
    // A child with no organization_id: exactly one CASCADE parent that is itself tenant-scoped.
    const parents = (table.foreign_keys ?? []).filter((fk) => fk.on_delete === "cascade" && fk.references.schema === "public");
    const tenantParent = parents.find((fk) => {
      const parent = tables[fk.references.table];
      return parent && (parent.foreign_keys ?? []).some((p) => p.columns[0] === "organization_id" && fkTargetsOrganizations(p));
    });
    if (tenantParent) {
      out[name] = {
        class: "tenant-child",
        scope: { via: "parent", parent: tenantParent.references.table, column: tenantParent.columns[0] },
      };
      continue;
    }
    throw new GraphError(
      `table public.${name} is neither tenant-scoped nor listed as shared — an unrecognised dependency blocks the archive`
    );
  }
  return out;
}

function columnNullable(table, column) {
  return Boolean((table.columns ?? []).find((c) => c.name === column)?.nullable);
}

/**
 * Foreign-key-safe insert order over the tenant tables (organization first). Self-references and the known deferred
 * columns are ignored for ordering; any other cycle is a GraphError.
 */
export function insertOrder(catalog, classes = classifyTables(catalog)) {
  const inScope = Object.keys(classes).filter((t) => classes[t].class !== "shared");
  const deps = new Map(inScope.map((t) => [t, new Set()]));
  for (const table of inScope) {
    const deferred = new Set(KNOWN_DEFERRED[table] ?? []);
    for (const fk of catalog.tables[table].foreign_keys ?? []) {
      if (fk.references.schema !== "public") continue;
      const target = fk.references.table;
      if (target === table || !deps.has(target)) continue;
      if (fk.columns.some((c) => deferred.has(c))) continue;
      deps.get(table).add(target);
    }
  }
  const order = [];
  const placed = new Set();
  while (order.length < inScope.length) {
    const ready = inScope.filter((t) => !placed.has(t) && [...deps.get(t)].every((d) => placed.has(d))).sort();
    if (ready.length === 0) {
      const stuck = inScope.filter((t) => !placed.has(t));
      throw new GraphError(`foreign keys form a cycle with no known deferred column among: ${stuck.join(", ")}`);
    }
    for (const t of ready) {
      order.push(t);
      placed.add(t);
    }
  }
  return order;
}

export const deleteOrder = (catalog, classes) => [...insertOrder(catalog, classes)].reverse();

/** Columns inserted as NULL and set afterwards (hosted-compatible inserts only; replica restores insert them directly). */
export const deferredColumns = () => KNOWN_DEFERRED;

/**
 * Every foreign key from a tenant-scoped table, for integrity checks: FKs into public tables and into auth.users.
 */
export function scopedForeignKeys(catalog, classes = classifyTables(catalog)) {
  const out = [];
  for (const [table, info] of Object.entries(classes)) {
    if (info.class === "shared") continue;
    for (const fk of catalog.tables[table].foreign_keys ?? []) {
      out.push({ table, column: fk.columns[0], columns: fk.columns, target: fk.references, onDelete: fk.on_delete });
    }
  }
  return out;
}

const q = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

/** SQL that selects one tenant's rows from a table (parameter $1 = organization id). */
export function scopeWhere(table, classes, alias = "t") {
  const info = classes[table];
  if (!info || info.class === "shared") throw new GraphError(`public.${table} is not tenant-scoped`);
  if (info.class === "organization") return `${alias}.id = $1`;
  if (info.class === "tenant") return `${alias}.organization_id = $1`;
  const { parent, column } = info.scope;
  return `${alias}.${q(column)} in (select p.id from public.${q(parent)} p where p.organization_id = $1)`;
}

/**
 * Integrity checks a restored tenant must pass, as { name, sql } where each query returns one integer `n` that must be
 * zero. Parameter $1 is the organization id.
 *   - every non-null foreign key from the tenant's rows resolves (public tables and auth.users);
 *   - wherever both sides carry organization_id, the target is this tenant's or shared (NULL), never another tenant's;
 *   - a tenant-child's other tenant parents belong to the same tenant (checked through its scope parent);
 *   - no row of ANOTHER tenant references this tenant's rows.
 */
export function integrityChecks(catalog, classes = classifyTables(catalog)) {
  const checks = [];
  const tables = catalog.tables;
  for (const fk of scopedForeignKeys(catalog, classes)) {
    if (fk.columns.length !== 1) continue;
    const col = q(fk.column);
    const target = fk.target.schema === "auth" ? `auth.${q(fk.target.table)}` : `public.${q(fk.target.table)}`;
    const targetCol = q(fk.target.columns[0]);
    checks.push({
      name: `fk ${fk.table}.${fk.column} → ${fk.target.schema}.${fk.target.table}`,
      sql: `select count(*)::int as n from public.${q(fk.table)} t where ${scopeWhere(fk.table, classes)} and t.${col} is not null and not exists (select 1 from ${target} r where r.${targetCol} = t.${col})`,
    });
    const targetTable = fk.target.schema === "public" ? tables[fk.target.table] : null;
    const bothOrg =
      targetTable &&
      fk.target.table !== "organizations" &&
      (tables[fk.table].columns ?? []).some((c) => c.name === "organization_id") &&
      (targetTable.columns ?? []).some((c) => c.name === "organization_id");
    if (bothOrg) {
      // A target row with a NULL organization_id is shared by design (a platform-owner profile, a system template);
      // only a row that belongs to ANOTHER tenant is a cross-tenant link.
      checks.push({
        name: `same-org ${fk.table}.${fk.column}`,
        sql: `select count(*)::int as n from public.${q(fk.table)} t join public.${q(fk.target.table)} r on r.${targetCol} = t.${col} where ${scopeWhere(fk.table, classes)} and r.organization_id is not null and r.organization_id <> t.organization_id`,
      });
    }
  }
  // A tenant-child has no organization_id of its own, so its OTHER tenant parents are checked through the scope parent:
  // an in-scope row must not point at another tenant's row, and another tenant's row must not point at ours.
  for (const [table, info] of Object.entries(classes)) {
    if (info.class !== "tenant-child") continue;
    for (const fk of tables[table].foreign_keys ?? []) {
      if (fk.references.schema !== "public" || fk.columns.length !== 1 || fk.columns[0] === info.scope.column) continue;
      if (classes[fk.references.table]?.class !== "tenant") continue;
      const col = q(fk.columns[0]);
      const target = `public.${q(fk.references.table)}`;
      const targetCol = q(fk.references.columns[0]);
      checks.push({
        name: `same-org ${table}.${fk.columns[0]} (via ${info.scope.parent})`,
        sql: `select count(*)::int as n from public.${q(table)} t join ${target} r on r.${targetCol} = t.${col} where ${scopeWhere(table, classes)} and r.organization_id is not null and r.organization_id <> $1`,
      });
      checks.push({
        name: `inbound ${table}.${fk.columns[0]} from other tenants`,
        sql: `select count(*)::int as n from public.${q(table)} t join ${target} r on r.${targetCol} = t.${col} where r.organization_id = $1 and not (${scopeWhere(table, classes)})`,
      });
    }
  }
  // Inbound references from other tenants into this tenant's rows.
  for (const [table, info] of Object.entries(classes)) {
    if (info.class !== "tenant" && info.class !== "organization") continue;
    for (const fk of tables[table].foreign_keys ?? []) {
      if (fk.references.schema !== "public" || fk.columns.length !== 1) continue;
      const target = classes[fk.references.table];
      if (!target || target.class === "shared" || fk.references.table === "organizations") continue;
      if (!(tables[table].columns ?? []).some((c) => c.name === "organization_id")) continue;
      checks.push({
        name: `inbound ${table}.${fk.columns[0]} from other tenants`,
        sql: `select count(*)::int as n from public.${q(table)} t join public.${q(fk.references.table)} r on r.${q(fk.references.columns[0])} = t.${q(fk.columns[0])} where t.organization_id is distinct from $1 and ${scopeWhere(fk.references.table, classes, "r")}`,
      });
    }
  }
  return checks;
}

/** Triggers marked ENABLE ALWAYS fire even under session_replication_role = replica; an exact restore refuses them. */
export function alwaysTriggers(catalog) {
  const out = [];
  for (const [table, info] of Object.entries(catalog.tables ?? {})) {
    for (const trigger of info.triggers ?? []) if (trigger.enabled === "A") out.push(`${table}.${trigger.name}`);
  }
  return out;
}

/**
 * Compare the graph with a live target's PostgREST OpenAPI definitions ({ table: [columns] }), both ways. Any table or
 * column on one side but not the other is a blocker.
 */
export function compareWithOpenApi(catalog, openApiTables) {
  const problems = [];
  const graphTables = Object.keys(catalog.tables ?? {});
  for (const table of Object.keys(openApiTables)) {
    if (!catalog.tables[table]) problems.push(`target has table ${table} that the graph does not know`);
  }
  for (const table of graphTables) {
    const live = openApiTables[table];
    if (!live) {
      problems.push(`graph table ${table} is missing on the target`);
      continue;
    }
    const graphColumns = new Set((catalog.tables[table].columns ?? []).map((c) => c.name));
    const liveColumns = new Set(live);
    for (const column of liveColumns) if (!graphColumns.has(column)) problems.push(`target has column ${table}.${column} that the graph does not know`);
    for (const column of graphColumns) if (!liveColumns.has(column)) problems.push(`graph column ${table}.${column} is missing on the target`);
  }
  return problems;
}

/** Table → column names from a PostgREST OpenAPI (Swagger 2) document's `definitions`. */
export function openApiTables(doc) {
  const out = {};
  for (const [name, definition] of Object.entries(doc?.definitions ?? {})) {
    out[name] = Object.keys(definition?.properties ?? {});
  }
  return out;
}
