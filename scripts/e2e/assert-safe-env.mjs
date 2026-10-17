#!/usr/bin/env node
/**
 * Engineering Phase E1 — refuse to build or start the E2E server unless its environment is provably local and mail-free.
 *
 * WHY: `next build` / `next start` also load `.env.local`, and in this repository that file is the PRODUCTION env file
 * (docs/ORPHAN_MEDIA_CLEANUP.md). Next never overwrites a variable that is already defined, so playwright.config.ts
 * defines the mail and cron variables as EMPTY: lib/notifications/send.ts then dry-runs ("unconfigured") and the cron
 * route refuses. This check runs first in the webServer command, in the same shell chain, and proves that worked —
 * an empty value that a shell dropped would otherwise let the Production Resend key through.
 *
 * Prints variable names only, never a value.
 */
const MUST_BE_EMPTY = ["RESEND_API_KEY", "NOTIFICATION_FROM_EMAIL", "CRON_SECRET"];
const MUST_BE_LOOPBACK = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"];
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const problems = [];
for (const name of MUST_BE_EMPTY) {
  if (!Object.prototype.hasOwnProperty.call(process.env, name)) problems.push(`${name} is not defined (it must be defined and empty)`);
  else if (process.env[name] !== "") problems.push(`${name} is set to a value (it must be empty)`);
}
for (const name of MUST_BE_LOOPBACK) {
  let host = null;
  try {
    host = new URL(process.env[name] ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!host || !LOOPBACK_HOSTS.has(host)) problems.push(`${name} is not a loopback URL`);
}
if (process.env.VERCEL_ENV) problems.push("VERCEL_ENV is set (the E2E server must run as a local development build)");

if (problems.length > 0) {
  console.error("\n[e2e-env] REFUSING TO BUILD OR START THE E2E SERVER\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\n  See playwright.config.ts (webServer.env) and docs/E2E_TESTING.md.\n");
  process.exit(1);
}
console.log("[e2e-env] verified: loopback Supabase and site URL; mail and cron variables defined and empty.");
