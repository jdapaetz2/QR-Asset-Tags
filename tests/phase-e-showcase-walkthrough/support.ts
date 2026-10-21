import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

import { assertLocal, getStackConfig } from "../security/setup/stack";

/**
 * Engineering Phase E2B — helpers for the showcase walkthrough. Playwright compiles test files as CommonJS, so nothing
 * here (or in what it imports) uses import.meta; the repository root is the working directory Playwright runs from.
 * Everything reaches the LOCAL stack only: getStackConfig refuses a non-loopback host, and every client re-asserts it.
 */
export const REPO = process.cwd();
export const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";

export async function db(): Promise<pg.Client> {
  const { apiUrl, dbUrl } = getStackConfig();
  assertLocal(apiUrl);
  const host = new URL(dbUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`refusing a non-loopback database host ${host}`);
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  await client.query("set timezone = 'UTC'");
  return client;
}

export function serviceClient(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = getStackConfig();
  assertLocal(apiUrl);
  return createClient(apiUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

const STRIPPED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "NOTIFICATION_FROM_EMAIL", "CRON_SECRET"];

/** Run an operator CLI under node with the Supabase, email and cron variables removed. */
export function runTool(script: string, args: string[]): { status: number | null; out: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of STRIPPED_ENV) delete env[name];
  const result = spawnSync(process.execPath, [path.join(REPO, script), ...args], { cwd: REPO, encoding: "utf8", env, timeout: 300_000 });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** A fresh directory outside the repository and outside OneDrive (the OS temp folder). */
export const tempRoot = (label: string): string => mkdtempSync(path.join(tmpdir(), `phase-e-${label}-`));
