import { Client } from "pg";

import { applyGrantParity } from "../../../scripts/lib/local-stack.mjs";
import { assertLocal, getStackConfig } from "./stack";

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
 * `service_role` and `authenticated` the table/sequence access hosted gives them by default,
 * then re-applies every migration revoke of `authenticated` the blanket grant would undo. `anon`
 * is deliberately left EXACTLY as the migrations set it, so every RLS/grant assertion stays a
 * faithful test of production behaviour. Never run against a hosted project (guarded) and never
 * shipped as a migration.
 *
 * The SQL itself lives in scripts/lib/local-stack.mjs (Engineering Phase E1) so the Phase E restore
 * and digest proof apply exactly the same grants as this suite.
 */
export async function applyLocalGrantParity(): Promise<void> {
  const { apiUrl, dbUrl } = getStackConfig();
  assertLocal(apiUrl);
  assertLocal(dbUrl);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await applyGrantParity(client, process.cwd());
  } finally {
    await client.end();
  }
}
