/**
 * Engineering Phase E2B / E2C — the database guards for a reset applied to STAGING (and the bootstrap there) and, from
 * E2C, to PRODUCTION under the operator's approved packet.
 *
 * A hosted apply runs one SQL transaction, which PostgREST cannot do, so it connects to the target's database with the
 * URL in PHASE_E_STAGING_DB_URL (.env.staging.local) or PHASE_E_PRODUCTION_DB_URL (.env.production-db.local, deleted by
 * the operator after use). Both are added by the operator and never printed, logged or put in an error message. The URL
 * must name that project's direct host (db.<ref>.supabase.co, user postgres) or a Supabase session pooler (port 5432,
 * user postgres.<ref>); the transaction pooler (6543) cannot hold a session, anything naming the other project's ref is
 * refused, and TLS is verified (PHASE_E_*_DB_CA_FILE adds the Supabase CA certificate when the system store lacks it).
 *
 * Before the transaction starts, the connected database must prove what it is, and the trigger / scheduled-job catalog
 * must be the reviewed one (docs/phase-e/DEMO_RECOVERY_RUNBOOK.md, "Operator live check"), so nothing reacts to the rows:
 * - staging: the staging-only isolation probe row exists (scripts/staging/seed-staging-qa.mjs seeds it in staging only);
 * - Production: that probe row is absent, and the four protected QR rows are exactly the tracked ones
 *   (docs/phase-e/manifests/protected-demo-routes.json). The cutover and a rollback also need Northridge suspended.
 */
import { readFileSync } from "node:fs";

import { ISOLATION_PROBE_SHORT_CODE } from "./smoke-target.mjs";

export const STAGING_REF = "kwserenxwjxozztyigmw";
export const PRODUCTION_REF = "apeiswnkheiwrpvumder";
export const STAGING_DB_ENV = "PHASE_E_STAGING_DB_URL";
export const STAGING_DB_CA_ENV = "PHASE_E_STAGING_DB_CA_FILE";
export const PRODUCTION_DB_ENV = "PHASE_E_PRODUCTION_DB_URL";
export const PRODUCTION_DB_CA_ENV = "PHASE_E_PRODUCTION_DB_CA_FILE";

const POOLER_HOST = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;

const TARGET_DATABASES = {
  staging: { ref: STAGING_REF, label: "staging", envName: STAGING_DB_ENV, caEnv: STAGING_DB_CA_ENV, envFile: ".env.staging.local", otherRef: PRODUCTION_REF, otherName: "the Production project" },
  production: { ref: PRODUCTION_REF, label: "Production", envName: PRODUCTION_DB_ENV, caEnv: PRODUCTION_DB_CA_ENV, envFile: ".env.production-db.local", otherRef: STAGING_REF, otherName: "the staging project" },
};

/** A pg client config for the target's database, or an Error that names the problem but never the URL. */
function databaseConfig(env, target, readFile) {
  const { ref, label, envName, caEnv, envFile, otherRef, otherName } = TARGET_DATABASES[target];
  const raw = String(env[envName] ?? "").trim();
  if (!raw) throw new Error(`${envName} is not set (add it to ${envFile}; it is never printed)`);
  if (raw.toLowerCase().includes(otherRef)) throw new Error(`${envName} names ${otherName}; refusing`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${envName} is not a valid connection URL`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error(`${envName} must be a postgresql:// URL`);
  const host = url.hostname.toLowerCase();
  const port = url.port ? Number(url.port) : 5432;
  const user = decodeURIComponent(url.username);
  const direct = host === `db.${ref}.supabase.co`;
  const pooler = POOLER_HOST.test(host);
  if (port === 6543) throw new Error("port 6543 is the transaction pooler; one reset transaction needs the session pooler or the direct host (port 5432)");
  if (!direct && !pooler) throw new Error(`host ${host} is neither the ${label} project's direct host nor a Supabase session pooler`);
  if (port !== 5432) throw new Error(`port ${port}: the ${label} database is reached on port 5432`);
  if (direct && user !== "postgres") throw new Error(`the direct ${label} host takes the user postgres`);
  if (pooler && user !== `postgres.${ref}`) throw new Error(`the session pooler user must be postgres.${ref} (the ${label} project)`);
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode && ["disable", "allow", "prefer"].includes(sslmode)) throw new Error("TLS is required: sslmode must not be disable, allow or prefer");
  const caFile = String(env[caEnv] ?? "").trim();
  const ssl = caFile ? { ca: readFile(caFile, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: true };
  return {
    host,
    port,
    user,
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
    ssl,
    application_name: "phase-e-showcase-reset",
    describe: direct ? `db.${ref}.supabase.co (direct)` : `${host} (session pooler, project ${ref})`,
  };
}

/** A pg client config for the staging database, or an Error that names the problem but never the URL. */
export function stagingDbConfig(env, { readFile = readFileSync } = {}) {
  return databaseConfig(env, "staging", readFile);
}

/** A pg client config for the Production database (E2C), or an Error that names the problem but never the URL. */
export function productionDbConfig(env, { readFile = readFileSync } = {}) {
  return databaseConfig(env, "production", readFile);
}

/** The 21 triggers the migrations create (the same list as the runbook's operator query). */
export const EXPECTED_TRIGGERS = Object.freeze([
  "asset_rental_sessions_set_updated_at", "assets_enforce_template_org", "assets_set_updated_at",
  "documents_set_updated_at", "equipment_page_templates_set_updated_at", "equipment_pages_set_updated_at",
  "form_submissions_set_return_session", "inspection_category_defaults_enforce_template_org",
  "inspection_category_defaults_set_updated_at", "inspection_templates_enforce_lifecycle",
  "inspection_templates_set_updated_at", "organizations_protect_commercial_fields", "organizations_set_updated_at",
  "profiles_protect_privileged_fields", "profiles_set_updated_at", "qr_links_enforce_coverage",
  "qr_links_protect_governance", "qr_links_set_default_production_primary", "qr_links_set_updated_at",
  "tag_requests_protect_insert", "tag_requests_set_updated_at",
]);

/** Read-only catalog query: public triggers, any not created by the migrations, and scheduled database jobs. */
export const CATALOG_SQL = `select
  count(*)::int as public_triggers,
  coalesce(string_agg(c.relname || '.' || t.tgname, ', ') filter (where not (t.tgname = any($1::text[]))), 'none') as unexpected_triggers,
  case when to_regclass('cron.job') is null then 'pg_cron not installed'
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from cron.job', false, true, '')))[1]::text || ' job(s)'
  end as scheduled_jobs
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal`;

export function catalogVerdict(row) {
  const problems = [];
  if (Number(row?.public_triggers) !== EXPECTED_TRIGGERS.length) problems.push(`${row?.public_triggers} public triggers, expected ${EXPECTED_TRIGGERS.length}`);
  if (row?.unexpected_triggers !== "none") problems.push(`unexpected triggers: ${row?.unexpected_triggers}`);
  if (!["pg_cron not installed", "0 job(s)"].includes(row?.scheduled_jobs)) problems.push(`scheduled jobs: ${row?.scheduled_jobs}`);
  return { ok: problems.length === 0, problems };
}

export const PROBE_SQL = "select count(*)::int as n from public.qr_links where short_code = $1";

/** Throw unless the connected pg client is the staging database with the reviewed catalog. */
export async function assertStagingDatabase(client) {
  const probe = await client.query(PROBE_SQL, [ISOLATION_PROBE_SHORT_CODE]);
  if (probe.rows[0]?.n !== 1) throw new Error("the staging-only isolation probe row is not in this database: it is not staging");
  const catalog = await client.query(CATALOG_SQL, [EXPECTED_TRIGGERS]);
  const verdict = catalogVerdict(catalog.rows[0]);
  if (!verdict.ok) throw new Error(`the staging catalog is not the reviewed one: ${verdict.problems.join("; ")}`);
  return { probe: "staging-only isolation probe present", catalog: catalog.rows[0] };
}

export const PROTECTED_QR_SQL =
  "select id, short_code, asset_id, organization_id, status, is_production_primary, supersedes_qr_link_id from public.qr_links where id = any($1::uuid[])";
export const ORGANIZATION_STATUS_SQL = "select status from public.organizations where id = $1";

/**
 * Throw unless the connected pg client is the Production database the protected-route manifest was recorded from, with
 * the reviewed catalog. `requireSuspended` (the cutover, a rollback) also needs the organization suspended in the owner
 * UI, so no visitor or user writes during the transaction.
 */
export async function assertProductionDatabase(client, { routes, organizationId, requireSuspended = false }) {
  const probe = await client.query(PROBE_SQL, [ISOLATION_PROBE_SHORT_CODE]);
  if (probe.rows[0]?.n !== 0) throw new Error("the staging-only isolation probe row is in this database: it is not Production");
  if (!routes?.length) throw new Error("no protected routes were given to check");
  const qr = await client.query(PROTECTED_QR_SQL, [routes.map((r) => r.qr_link_id)]);
  const rows = new Map(qr.rows.map((r) => [r.id, r]));
  for (const route of routes) {
    const row = rows.get(route.qr_link_id);
    const same =
      row &&
      row.short_code === route.short_code &&
      row.asset_id === route.asset_id &&
      row.organization_id === organizationId &&
      row.status === "active" &&
      row.is_production_primary === true &&
      row.supersedes_qr_link_id === null;
    if (!same) throw new Error(`protected route ${route.short_code} is not exactly the tracked row: this is not the Production database the manifest describes`);
  }
  const catalog = await client.query(CATALOG_SQL, [EXPECTED_TRIGGERS]);
  const verdict = catalogVerdict(catalog.rows[0]);
  if (!verdict.ok) throw new Error(`the Production catalog is not the reviewed one: ${verdict.problems.join("; ")}`);
  if (requireSuspended) {
    const org = await client.query(ORGANIZATION_STATUS_SQL, [organizationId]);
    if (org.rows[0]?.status !== "suspended") throw new Error("the organization must be suspended in the owner UI before this apply (write coordination)");
  }
  return {
    probe: "staging-only isolation probe absent",
    protected: `${routes.length} protected QR rows exactly as tracked`,
    catalog: catalog.rows[0],
    ...(requireSuspended ? { organization: "suspended" } : {}),
  };
}
