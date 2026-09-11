import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";

import { assertLocal, getStackConfig } from "./stack";

/**
 * Migrations whose `-- local-parity:begin` / `-- local-parity:end` block must run again after the blanket
 * `authenticated` grant below. Executing the migration's own statements (rather than a copy) keeps the local end
 * state identical to production, including column-level grants that a table REVOKE would otherwise wipe.
 */
const LOCAL_PARITY_MIGRATIONS = ["0035_tag_request_internal_columns.sql"];

function localParityBlock(file: string): string {
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8");
  const begin = sql.indexOf("-- local-parity:begin");
  const end = sql.indexOf("-- local-parity:end");
  if (begin < 0 || end <= begin) throw new Error(`${file}: local-parity markers are missing`);
  return sql.slice(begin, end);
}

/**
 * LOCAL-ONLY grant parity (Phase A3.2).
 *
 * Hosted Supabase grants the `service_role` DB role full privileges on the public schema
 * (that is why the app's service-role code — notifications, team admin — works in
 * production). The local CLI stack, with the new `auto_expose_new_tables` default OFF,
 * does NOT auto-grant the Data API roles, so `service_role` cannot touch our tables. The
 * migrations only `grant ... to authenticated`/`anon` (which the assertion clients rely on
 * and which stay under test), never to `service_role`.
 *
 * This connects as the `postgres` superuser (local DB_URL only, loopback-guarded) and grants
 * `service_role` and `authenticated` the table/sequence access hosted gives them by default —
 * hosted ALTER DEFAULT PRIVILEGES grant `authenticated` on every new public table, so a couple of
 * later tables (e.g. equipment_page_templates in 0008) never re-granted `authenticated` explicitly
 * and are unreachable on the local stack without it. Because this blanket grant runs AFTER the
 * migrations, every migration that revokes from `authenticated` must be re-applied below —
 * otherwise the local stack silently restores a privilege production does not have. `anon` is deliberately left EXACTLY as the migrations set
 * it (explicit grants minus explicit revokes), so every RLS/grant assertion — including "anon
 * holds no DML on the admin tables" — stays a faithful test of production behavior. Never run
 * against a hosted project (guarded) and never shipped as a migration.
 */
export async function applyLocalGrantParity(): Promise<void> {
  const { apiUrl, dbUrl } = getStackConfig();
  assertLocal(apiUrl);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(`
      grant usage on schema public to service_role, authenticated;
      grant all on all tables in schema public to service_role;
      grant all on all sequences in schema public to service_role;
      grant all on all routines in schema public to service_role;
      -- authenticated: match hosted default privileges (tables + sequences). anon untouched.
      grant select, insert, update, delete on all tables in schema public to authenticated;
      grant usage, select on all sequences in schema public to authenticated;
      -- Re-apply migration revokes of authenticated that the blanket grant above would otherwise undo.
      -- Hosted applies the default grant then the migration revoke; this reproduces that end state.
      -- rate_limit_counters (0033) is service_role-only.
      revoke all on public.rate_limit_counters from anon, authenticated;
      alter default privileges in schema public grant all on tables to service_role;
      alter default privileges in schema public grant all on sequences to service_role;
      alter default privileges in schema public grant all on routines to service_role;
    `);
    // Column-level SELECT (0035): re-run the migration's own revoke-then-grant block after the blanket grant.
    for (const file of LOCAL_PARITY_MIGRATIONS) {
      await client.query(localParityBlock(file));
    }
  } finally {
    await client.end();
  }
}
