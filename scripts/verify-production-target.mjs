#!/usr/bin/env node
/**
 * Production target verifier (Phase B1A). The mirror of verify-staging-target.mjs.
 *
 * Confirms the shell is pointed at the PRODUCTION Supabase project and explicitly **rejects the staging
 * project**, so a production-only procedure (a migration push, a support query) can never be run against
 * staging by mistake — and vice versa.
 *
 * This verifier does NOT authorise anything destructive on its own. `db push` remains approval-gated and
 * `db reset --linked` remains forbidden; see docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md.
 *
 * NEVER PRINTS key material. Hosts and project refs are public by construction.
 *
 * Run: npm run verify:production-target
 */
import { assertTarget, isDryRunEmail, tagBaseUrlIssue } from "./lib/env-target.mjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const expectedStagingRef = process.env.STAGING_SUPABASE_REF ?? "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

const results = [];
const add = (level, name, detail) => results.push({ level, name, detail });

console.log("\nProduction target verifier\n");

if (!supabaseUrl) {
  console.log("  [FAIL] supabase-url: NEXT_PUBLIC_SUPABASE_URL is not set in this shell.");
  console.log("\n  Production target: NOT VERIFIED.\n");
  process.exit(1);
}

let resolved;
try {
  // Passing the staging ref lets this positively RECOGNISE staging and refuse it by name.
  resolved = assertTarget("production", {
    supabaseUrl,
    expectedStagingRef: expectedStagingRef || null,
  });
  add("pass", "target", `resolved PRODUCTION (host: ${resolved.host}${resolved.ref ? `, ref: ${resolved.ref}` : ""})`);
} catch (err) {
  console.log(`  [FAIL] target: ${err.message}`);
  console.log("\n  Production target: NOT VERIFIED. Refusing to treat this project as production.\n");
  process.exit(1);
}

add(
  supabaseUrl.startsWith("https://") ? "pass" : "fail",
  "https",
  supabaseUrl.startsWith("https://") ? "Supabase URL uses https" : "Supabase URL must use https"
);

const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
add(
  hasServiceRole ? "pass" : "warn",
  "service-role",
  hasServiceRole
    ? "SUPABASE_SERVICE_ROLE_KEY is present (value not read or printed)"
    : "SUPABASE_SERVICE_ROLE_KEY not set (fine for read-only checks)"
);

if (siteUrl) {
  const issue = tagBaseUrlIssue(siteUrl);
  add(
    issue ? "warn" : "pass",
    "site-url",
    issue
      ? `${siteUrl} ${issue} — production is not yet on the permanent domain (expected until Phase B3)`
      : `${siteUrl} is a tag-safe production origin`
  );
} else {
  add("warn", "site-url", "NEXT_PUBLIC_SITE_URL not set in this shell");
}

add(
  isDryRunEmail() ? "warn" : "pass",
  "email",
  isDryRunEmail()
    ? "notifications are dry-run — production will NOT send email (expected until Phase B4)"
    : "a provider is configured"
);

for (const r of results) console.log(`  [${r.level.toUpperCase()}] ${r.name}: ${r.detail}`);

const fails = results.filter((r) => r.level === "fail").length;
const warns = results.filter((r) => r.level === "warn").length;
console.log(`\n${fails} fail, ${warns} warn, ${results.length - fails - warns} pass`);

if (fails) {
  console.log("\n  Production target: NOT VERIFIED.\n");
  process.exit(1);
}
console.log("\n  Production target: VERIFIED.");
console.log("  Reminder: this confirms the TARGET only. `db push` stays approval-gated and");
console.log("  `db reset --linked` is forbidden — see docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md.\n");
