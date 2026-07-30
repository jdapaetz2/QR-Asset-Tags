#!/usr/bin/env node
/**
 * Staging target verifier (Phase B1A).
 *
 * Answers one question before anything destructive runs: **am I really pointed at the dedicated staging
 * Supabase project, and not at production?** Phase A7 found preview writing to production with the
 * production service-role key; this is the gate that makes that impossible to do by accident.
 *
 * FAIL-CLOSED: with no `STAGING_SUPABASE_REF` declared there is nothing to verify against, so this
 * refuses rather than guessing. An unrecognised remote project is classified as production, not staging.
 *
 * NEVER PRINTS: service-role keys, anon keys, access tokens, bypass secrets. It reports the presence of
 * a key, never its value. Hosts and project refs ARE printed — both are public by construction (the ref
 * is the hostname inside NEXT_PUBLIC_SUPABASE_URL, which ships in the browser bundle).
 *
 * Run: npm run verify:staging-target
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STAGING_SUPABASE_REF,
 *      NEXT_PUBLIC_SITE_URL (optional checks).
 */
import { assertTarget, isDryRunEmail, tagBaseUrlIssue } from "./lib/env-target.mjs";

const results = [];
const add = (level, name, detail) => results.push({ level, name, detail });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const expectedStagingRef = process.env.STAGING_SUPABASE_REF ?? "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

console.log("\nStaging target verifier\n");

if (!supabaseUrl) {
  console.log("  [FAIL] supabase-url: NEXT_PUBLIC_SUPABASE_URL is not set in this shell.");
  console.log("\n  Staging target: NOT VERIFIED. Nothing may run against staging.\n");
  process.exit(1);
}

// 1) The decisive check: project ref must resolve to the declared staging project.
let resolved;
try {
  resolved = assertTarget("staging", { supabaseUrl, expectedStagingRef: expectedStagingRef || null });
  add("pass", "target", `resolved STAGING (host: ${resolved.host}, ref: ${resolved.ref})`);
} catch (err) {
  console.log(`  [FAIL] target: ${err.message}`);
  console.log("\n  Staging target: NOT VERIFIED. Nothing may run against staging.");
  console.log("  If the staging project does not exist yet, that is expected —");
  console.log("  see docs/STAGING_ENVIRONMENT_SETUP.md (operator action, Phase B1B).\n");
  process.exit(1);
}

// 2) Transport + host shape.
add(
  supabaseUrl.startsWith("https://") ? "pass" : "fail",
  "https",
  supabaseUrl.startsWith("https://") ? "Supabase URL uses https" : "Supabase URL must use https"
);

// 3) Service-role key present — presence only, never the value, never a prefix.
const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
add(
  hasServiceRole ? "pass" : "fail",
  "service-role",
  hasServiceRole ? "SUPABASE_SERVICE_ROLE_KEY is present (value not read or printed)" : "SUPABASE_SERVICE_ROLE_KEY is not set"
);

// 4) Site URL should be a staging/preview origin — and must NOT be tag-safe.
if (!siteUrl) {
  add("warn", "site-url", "NEXT_PUBLIC_SITE_URL not set in this shell (skipping staging-origin check)");
} else {
  const issue = tagBaseUrlIssue(siteUrl);
  if (issue) {
    add("pass", "site-url", `${siteUrl} is a non-permanent origin (${issue}) — correct for staging`);
  } else {
    add(
      "fail",
      "site-url",
      `${siteUrl} is a TAG-SAFE production origin. Staging must not use the permanent domain — ` +
        "a QA scan would then be indistinguishable from a real tag."
    );
  }
}

// 5) Permanent-tag output must stay blocked on staging.
add(
  siteUrl && !tagBaseUrlIssue(siteUrl) ? "fail" : "pass",
  "tag-output",
  "permanent-tag output remains blocked (see npm run verify:tag-config)"
);

// 6) Notifications default to dry-run.
const dryRun = isDryRunEmail();
add(
  dryRun ? "pass" : "warn",
  "email",
  dryRun
    ? "notifications are dry-run (no provider configured)"
    : "a provider IS configured — staging will attempt real sends. Intentional? See docs/EMAIL_CONFIGURATION_CHECKLIST.md"
);

for (const r of results) console.log(`  [${r.level.toUpperCase()}] ${r.name}: ${r.detail}`);

const fails = results.filter((r) => r.level === "fail").length;
const warns = results.filter((r) => r.level === "warn").length;
console.log(`\n${fails} fail, ${warns} warn, ${results.length - fails - warns} pass`);

if (fails) {
  console.log("\n  Staging target: NOT VERIFIED.\n");
  process.exit(1);
}
console.log("\n  Staging target: VERIFIED. Staging-scoped operations may proceed.\n");
