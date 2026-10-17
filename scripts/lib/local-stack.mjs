/**
 * Engineering Phase E1 — the local database guard and shared helpers for the Phase E recovery tools.
 *
 * WHY: the archive restore and the reset rehearsal write straight to a database, so they may only ever reach a database
 * on this machine. tests/security/setup/stack.ts guards the API URL; these tools also write through the DB URL, so BOTH
 * are checked here. The local grant-parity SQL lives here too, so the security suite (tests/security/setup/grants.ts),
 * the restore and the digest proof apply exactly the same grants.
 *
 * Two kinds of local target exist (docs/phase-e/DEMO_RECOVERY_RUNBOOK.md):
 *   - the repo's Supabase stack (`supabase start`), which Docker Desktop publishes on all interfaces — synthetic and
 *     staging-QA data only;
 *   - a temporary standalone Postgres container bound explicitly to 127.0.0.1 with its data in memory — the only place
 *     a real archive is ever restored. `standalonePostgresPlan` describes it; `assertListenersLoopback` proves it.
 *
 * Messages carry hosts and ports only, never a key or password.
 */
import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Why a URL is not a loopback target, or null. */
export function loopbackProblem(label, url) {
  let host;
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch {
    return `${label} is not a valid URL`;
  }
  return LOOPBACK_HOSTS.has(host) ? null : `${label} is not loopback (host: ${host})`;
}

/** Throw unless every supplied URL is loopback. Pass `{ "API URL": …, "DB URL": … }`. */
export function assertLoopbackTargets(targets) {
  const problems = Object.entries(targets)
    .filter(([, url]) => url !== undefined && url !== null)
    .map(([label, url]) => loopbackProblem(label, url))
    .filter(Boolean);
  if (problems.length > 0) throw new Error(`refusing to touch a non-local database: ${problems.join("; ")}.`);
}

/** The repo's local stack from `supabase status -o json`, with BOTH the API and DB URLs loopback-checked. */
export function readLocalStackStatus(repoRoot) {
  // One static command string (no argument array), so Windows can run the npx.cmd shim through a shell safely.
  const out = execSync(`${process.platform === "win32" ? "npx.cmd" : "npx"} supabase status -o json`, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const start = out.indexOf("{");
  if (start < 0) throw new Error("supabase status returned no JSON — is the local stack running? (npm.cmd exec -- supabase start)");
  const status = JSON.parse(out.slice(start));
  const config = { apiUrl: status.API_URL, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY, dbUrl: status.DB_URL };
  for (const [key, value] of Object.entries(config)) if (!value) throw new Error(`supabase status is missing ${key}`);
  assertLoopbackTargets({ "API URL": config.apiUrl, "DB URL": config.dbUrl });
  return config;
}

// ---------------------------------------------------------------------------------------------------------------------
// The standalone, loopback-only Postgres used for real archives
// ---------------------------------------------------------------------------------------------------------------------

/** The cached Supabase Postgres image the local stack already uses, so no download is needed. */
export const STANDALONE_IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.155";
export const STANDALONE_PORT = 55432;
export const STANDALONE_CONTAINER = "mulemark-phase-e-restore";
/** The throwaway password of the loopback-only, in-memory standalone container. Not a secret; never printed. */
export const STANDALONE_PASSWORD = "phase-e-local-only";

/**
 * `docker run` arguments for the temporary restore database: an EXPLICIT 127.0.0.1 port binding (Docker Desktop
 * honours explicit host IPs even though it ignored the loopback defaults for the Supabase CLI's containers), the data
 * directory on tmpfs (nothing written to a volume), removed on stop. The password is a local throwaway, never printed.
 */
export function standalonePostgresPlan(password) {
  return [
    "run",
    "--detach",
    "--rm",
    "--name",
    STANDALONE_CONTAINER,
    "--publish",
    `127.0.0.1:${STANDALONE_PORT}:5432`,
    "--tmpfs",
    "/var/lib/postgresql/data:rw",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    STANDALONE_IMAGE,
  ];
}

export function standaloneDbUrl(password) {
  return `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${STANDALONE_PORT}/postgres`;
}

/**
 * Pure check of `Get-NetTCPConnection`-style listener rows ({ LocalAddress, LocalPort }) for the given ports: every
 * listener must be loopback, and at least one must exist per port. Returns the problems (empty = safe).
 */
export function listenerProblems(listeners, ports) {
  const problems = [];
  for (const port of ports) {
    const rows = listeners.filter((l) => Number(l.LocalPort) === port);
    if (rows.length === 0) problems.push(`nothing is listening on ${port}`);
    for (const row of rows) {
      const address = String(row.LocalAddress).toLowerCase();
      if (address !== "127.0.0.1" && address !== "::1") problems.push(`port ${port} listens on ${address} (not loopback)`);
    }
  }
  return problems;
}

/** Windows TCP listeners on a port, as { LocalAddress, LocalPort } rows; empty when nothing listens. */
export function windowsListeners(port) {
  if (process.platform !== "win32") throw new Error("listener verification is implemented for Windows only");
  // Get-NetTCPConnection errors when nothing listens; that is an empty result, not a failure.
  const out = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `try { Get-NetTCPConnection -State Listen -LocalPort ${Number(port)} -ErrorAction Stop | Select-Object LocalAddress, LocalPort | ConvertTo-Json -Compress } catch { '' }`,
    ],
    { encoding: "utf8" }
  ).trim();
  if (!out) return [];
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Throw unless the standalone container's port is served by loopback listeners only. */
export function assertStandaloneLoopback() {
  const problems = listenerProblems(windowsListeners(STANDALONE_PORT), [STANDALONE_PORT]);
  if (problems.length > 0) throw new Error(`the standalone target is not loopback-only: ${problems.join("; ")}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Grant parity (moved from tests/security/setup/grants.ts so both callers share one copy)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Hosted Supabase grants `service_role` full privileges on the public schema; the local CLI stack (with
 * `auto_expose_new_tables` off) does not, and hosted default privileges grant `authenticated` on every new table. This
 * reproduces that end state locally. `anon` is left exactly as the migrations set it. Never run against a hosted
 * project, and never shipped as a migration.
 */
export const GRANT_PARITY_SQL = `
  grant usage on schema public to service_role, authenticated;
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
  grant all on all routines in schema public to service_role;
  -- authenticated: match hosted default privileges (tables + sequences). anon untouched.
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  -- Re-apply migration revokes of authenticated that the blanket grant above would otherwise undo.
  -- rate_limit_counters (0033) is service_role-only.
  revoke all on public.rate_limit_counters from anon, authenticated;
  -- notification_digest_runs (0036) is service_role-only.
  revoke all on public.notification_digest_runs from anon, authenticated;
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant all on sequences to service_role;
  alter default privileges in schema public grant all on routines to service_role;
`;

/** Migrations whose `-- local-parity:begin` … `-- local-parity:end` block must run again after the blanket grant. */
export const LOCAL_PARITY_MIGRATIONS = ["0035_tag_request_internal_columns.sql"];

export function localParityBlocks(repoRoot) {
  return LOCAL_PARITY_MIGRATIONS.map((file) => {
    const sql = readFileSync(path.join(repoRoot, "supabase", "migrations", file), "utf8");
    const begin = sql.indexOf("-- local-parity:begin");
    const end = sql.indexOf("-- local-parity:end");
    if (begin < 0 || end <= begin) throw new Error(`${file}: local-parity markers are missing`);
    return sql.slice(begin, end);
  });
}

/** Apply grant parity through an already-guarded pg client. */
export async function applyGrantParity(client, repoRoot) {
  await client.query(GRANT_PARITY_SQL);
  for (const block of localParityBlocks(repoRoot)) await client.query(block);
}

// ---------------------------------------------------------------------------------------------------------------------
// Restore canaries
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Prove, inside a transaction that is always rolled back, the two database behaviours an exact restore depends on:
 *   1. `SET LOCAL session_replication_role = replica` takes effect for this role;
 *   2. under replica, a qr_links insert keeps is_production_primary/supersedes_qr_link_id, which the governance trigger
 *      would otherwise wipe (M0023:105-108) — i.e. user triggers really are off;
 * and count user triggers marked ENABLE ALWAYS, which would still fire under replica (must be zero).
 */
export async function runReplicaCanaries(client) {
  const result = { replicaRole: false, replicaKeepsGovernance: false, alwaysTriggers: null };
  await client.query("begin");
  try {
    await client.query("set local session_replication_role = replica");
    const role = await client.query("show session_replication_role");
    result.replicaRole = role.rows[0]?.session_replication_role === "replica";
    const supersedes = randomUUID();
    const inserted = await client.query(
      `insert into public.qr_links (id, organization_id, asset_id, short_code, public_url, status, is_production_primary, supersedes_qr_link_id)
       values ($1, $2, $3, $4, 'http://127.0.0.1/t/canary', 'active', true, $5)
       returning is_production_primary, supersedes_qr_link_id`,
      [randomUUID(), randomUUID(), randomUUID(), `zz-canary-${randomUUID().slice(0, 8)}`, supersedes]
    );
    const row = inserted.rows[0];
    result.replicaKeepsGovernance = row?.is_production_primary === true && row?.supersedes_qr_link_id === supersedes;
    const always = await client.query(
      `select count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and not t.tgisinternal and t.tgenabled = 'A'`
    );
    result.alwaysTriggers = always.rows[0]?.n ?? null;
  } finally {
    await client.query("rollback");
  }
  return result;
}
