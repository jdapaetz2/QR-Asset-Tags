import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

import { assertLoopbackTargets, readLocalStackStatus } from "../../scripts/lib/local-stack.mjs";
import { tableHash } from "../../scripts/lib/showcase-archive.mjs";
import { scopeWhere } from "../../scripts/lib/tenant-graph.mjs";

/**
 * Engineering Phase E1 — shared helpers for the local recovery rehearsal (`npm run test:phase-e-local`). Everything here
 * reaches the repo's LOCAL Supabase stack only: `readLocalStackStatus` loopback-checks both the API URL and the DB URL,
 * and every pg client re-asserts it. Child processes run the real operator CLIs with Supabase and email variables
 * removed from their environment, so nothing can fall back to a hosted project.
 */

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";

type Graph = { insert_order: string[]; classes: Record<string, unknown>; graph_sha256: string };
export const GRAPH: Graph = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/manifests/tenant-dependency-graph.json"), "utf8"));

type Stack = { apiUrl: string; anonKey: string; serviceRoleKey: string; dbUrl: string };
let cached: Stack | null = null;

export function stack(): Stack {
  if (!cached) cached = readLocalStackStatus(REPO) as Stack;
  return cached;
}

export async function db(): Promise<pg.Client> {
  const { apiUrl, dbUrl } = stack();
  assertLoopbackTargets({ "API URL": apiUrl, "DB URL": dbUrl });
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  await client.query("set timezone = 'UTC'");
  return client;
}

const noPersist = { auth: { autoRefreshToken: false, persistSession: false } } as const;
export const serviceClient = (): SupabaseClient => createClient(stack().apiUrl, stack().serviceRoleKey, noPersist);
export const anonClient = (): SupabaseClient => createClient(stack().apiUrl, stack().anonKey, noPersist);

export async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`local sign-in failed for a fixture identity: ${error.message}`);
  return client;
}

const STRIPPED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "NOTIFICATION_FROM_EMAIL",
  "CRON_SECRET",
];

/** Run an operator CLI under node with a scrubbed environment. Returns the exit status and combined output. */
export function runTool(script: string, args: string[], env: Record<string, string> = {}): { status: number | null; out: string } {
  const clean: NodeJS.ProcessEnv = { ...process.env };
  for (const name of STRIPPED_ENV) delete clean[name];
  const result = spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...clean, ...env },
    timeout: 300_000,
  });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** A fresh directory outside the repository and outside OneDrive (the OS temp folder). */
export const tempRoot = (label: string): string => mkdtempSync(path.join(tmpdir(), `phase-e-${label}-`));

/** The package directory an export printed. */
export function packagePathFrom(out: string): string {
  const m = /package path: (.+)$/m.exec(out);
  if (!m) throw new Error(`the export did not report a package path:\n${out.slice(-2000)}`);
  return m[1].trim();
}

/** One hash per tenant table of the organization's rows as the database holds them (to_jsonb, UTC). */
export async function orgFingerprint(client: pg.Client, orgId: string = NORTHRIDGE): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const table of GRAPH.insert_order) {
    const res = await client.query(`select to_jsonb(t) as j from public."${table}" t where ${scopeWhere(table, GRAPH.classes)}`, [orgId]);
    out[table] = `${res.rows.length}:${tableHash(res.rows.map((r: { j: unknown }) => r.j))}`;
  }
  return out;
}

export async function count(client: pg.Client, sql: string, params: unknown[] = []): Promise<number> {
  return Number((await client.query(sql, params)).rows[0]?.n ?? 0);
}
