#!/usr/bin/env node
/**
 * Targeted staging QA password reset.
 *
 * WHY THIS EXISTS: the staging QA logins stopped matching `STAGING_QA_PASSWORD`. The only existing
 * remedy was `staging:seed --confirm`, which DELETES both QA organizations and everything under them
 * (assets, QR links, rental sessions, submissions, documents) before recreating them. That is a
 * disproportionate answer to a wrong password, and it would destroy accumulated QA state — including
 * the isolation probe's provenance and any submissions captured during device/email testing.
 *
 * This script changes ONE thing: the password of four named auth users. It writes nothing else. It
 * never deletes, never touches `public.*` tables, and never re-runs the seeder.
 *
 * FAIL-CLOSED PRECONDITIONS — all must hold or nothing is written:
 *   1. `MULEMARK_TARGET=staging`, stated explicitly. The target is never inferred.
 *   2. `assertTarget("staging", …)` resolves the configured Supabase URL to the ref in
 *      `STAGING_SUPABASE_REF`, which must equal EXPECTED_STAGING_REF below. The known production ref
 *      can never satisfy this (see scripts/lib/env-target.mjs — ambiguity fails closed to production).
 *   3. Every target address ends in the reserved-by-RFC-2606 `.invalid` TLD, so this can never be
 *      pointed at a deliverable mailbox.
 *   4. `STAGING_QA_PASSWORD` is present (supplied by `--env-file=.env.staging.local`, which is
 *      untracked). Never a default, never a CLI argument, never printed.
 *   5. `--confirm` is passed. A bare invocation reports what it would do and exits 0.
 *
 * The password is never printed, logged, or included in an error message — not even redacted, since
 * the length alone is worth withholding.
 *
 * Usage (one fixed command; no inline env prefixes, no secrets on the command line):
 *   npm run staging:qa-password              # dry run — verifies target + users, writes nothing
 *   npm run staging:qa-password -- --confirm # updates the four passwords, then verifies login
 *   npm run staging:qa-password -- --verify-only   # only checks login; changes nothing
 */
import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";

/**
 * The staging project this script is allowed to touch, pinned in source. A Supabase project ref is
 * public by construction (it is the hostname inside NEXT_PUBLIC_SUPABASE_URL, compiled into the
 * browser bundle), so committing it is safe — and it is what lets the script refuse a project that
 * merely *claims* to be staging via an environment variable.
 */
const EXPECTED_STAGING_REF = "kwserenxwjxozztyigmw";

/** The complete blast radius. Exactly these four auth users; nothing else is read or written. */
const QA_EMAILS = [
  "qa.owner@mulemark-staging.invalid",
  "qa.admin@mulemark-staging.invalid",
  "qa.staff@mulemark-staging.invalid",
  "qa.admin.orgb@mulemark-staging.invalid",
];

/** Belt and braces: `.invalid` is reserved by RFC 2606 and can never be a real mailbox. */
const REQUIRED_EMAIL_SUFFIX = "@mulemark-staging.invalid";

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const verifyOnly = args.includes("--verify-only");

function fail(msg, extra = []) {
  console.error(`\n[qa-password] REFUSING TO RUN\n\n  ${msg}\n`);
  for (const line of extra) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

// ---- Preconditions -----------------------------------------------------------
const target = process.env.MULEMARK_TARGET ?? "";
if (target !== "staging") {
  fail(`MULEMARK_TARGET must be exactly "staging" (got ${target ? `"${target}"` : "unset"}).`, [
    "The target is never inferred — it must be stated. Add this non-secret line to the",
    "untracked .env.staging.local so the fixed npm command carries it:",
    "",
    "  MULEMARK_TARGET=staging",
  ]);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const stagingRef = process.env.STAGING_SUPABASE_REF ?? "";

if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set (the staging key; never printed).");
if (!anonKey) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — needed to verify login as a real client.");

// The declared ref must be the one pinned here. Without this an operator could point the script at
// any project simply by exporting a different STAGING_SUPABASE_REF.
if (stagingRef !== EXPECTED_STAGING_REF) {
  fail(
    `STAGING_SUPABASE_REF must be exactly "${EXPECTED_STAGING_REF}" ` +
      `(got ${stagingRef ? `"${stagingRef}"` : "unset"}).`,
    ["This script is pinned to one staging project. Refs are public, not secrets."]
  );
}

let resolved;
try {
  resolved = assertTarget("staging", { supabaseUrl, expectedStagingRef: EXPECTED_STAGING_REF });
} catch (err) {
  fail(err.message, ["See docs/STAGING_ENVIRONMENT_SETUP.md."]);
}
// Redundant with assertTarget (which fails closed to production), kept because the cost of being
// wrong here is resetting credentials on the live project.
if (resolved.ref !== EXPECTED_STAGING_REF) {
  fail(`resolved project ref ${resolved.ref} is not the expected staging ref.`);
}

for (const email of QA_EMAILS) {
  if (!email.endsWith(REQUIRED_EMAIL_SUFFIX)) {
    fail(`refusing: ${email} is not a ${REQUIRED_EMAIL_SUFFIX} address.`);
  }
}

const password = process.env.STAGING_QA_PASSWORD ?? "";
if (!verifyOnly && !password) {
  fail("STAGING_QA_PASSWORD is not set.", [
    "It is read from the untracked .env.staging.local via --env-file. Never pass it as a",
    "command-line argument. It is not printed or logged by this script.",
  ]);
}
if (!verifyOnly && password.length < 12) fail("STAGING_QA_PASSWORD is too short (min 12 characters).");
if (verifyOnly && !password) fail("STAGING_QA_PASSWORD is required to verify a password login.");

console.log(`\n[qa-password] target verified: STAGING (host: ${resolved.host}, ref: ${resolved.ref})`);
console.log(`[qa-password] scope: ${QA_EMAILS.length} auth users. No table rows are read or written.`);

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data?.users.find((u) => u.email === email) ?? null;
}

/** Resolve all four users up front so a missing account stops the run before any write. */
async function resolveUsers() {
  const found = [];
  const missing = [];
  for (const email of QA_EMAILS) {
    const user = await findUserByEmail(email);
    if (user) found.push({ email, id: user.id });
    else missing.push(email);
  }
  if (missing.length) {
    fail(`these QA users do not exist on the staging project: ${missing.join(", ")}`, [
      "This script only updates EXISTING users; it never creates them. If the accounts are",
      "genuinely absent, that is a seeding problem — run the staging seeder deliberately.",
    ]);
  }
  return found;
}

/**
 * Verify each user can actually sign in with the password. Uses the ANON key through the normal
 * sign-in path, so this exercises what a QA operator does in a browser rather than trusting that the
 * admin write returned 200. Every session is signed out immediately.
 */
async function verifyLogins(users) {
  const results = [];
  for (const u of users) {
    const client = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email: u.email, password });
    const ok = Boolean(data?.session) && !error;
    // Only the provider's coarse reason is surfaced, never the credential.
    results.push({ email: u.email, ok, reason: ok ? "" : (error?.message ?? "no session returned") });
    if (data?.session) await client.auth.signOut();
  }
  return results;
}

/**
 * A successful Supabase sign-in is necessary but NOT sufficient: the app then resolves a `profiles`
 * row and an organization, and rejects the session if the profile is disabled or the org is not
 * active (`requireActiveOrg` redirects to /suspended; `current_org_id()` returns null for a
 * non-active org, which strips all tenant RLS scope). A user whose password is perfectly valid can
 * therefore still be bounced out of the dashboard — and to a human that looks identical to "the
 * login was rejected". This reports the layer above the credential so the two are never confused.
 */
async function inspectAppReadiness(users) {
  const rows = [];
  for (const u of users) {
    const { data: profile } = await admin
      .from("profiles")
      .select("role, status, organization_id")
      .eq("auth_user_id", u.id)
      .maybeSingle();
    let orgStatus = null;
    if (profile?.organization_id) {
      const { data: org } = await admin
        .from("organizations")
        .select("status")
        .eq("id", profile.organization_id)
        .maybeSingle();
      orgStatus = org?.status ?? "MISSING";
    }
    rows.push({
      email: u.email,
      profile: profile ? `${profile.role}/${profile.status}` : "NO PROFILE ROW",
      org: profile?.organization_id ? orgStatus : "(none — platform owner)",
    });
  }
  return rows;
}

function reportAppReadiness(rows) {
  console.log("  Application readiness (profile + organization state):");
  for (const r of rows) {
    const bad =
      r.profile === "NO PROFILE ROW" ||
      r.profile.endsWith("/disabled") ||
      r.org === "suspended" ||
      r.org === "MISSING";
    console.log(`    ${bad ? "WARN" : "ok  "}  ${r.email}  profile=${r.profile}  org=${r.org}`);
  }
  console.log("");
}

function reportLogins(results) {
  console.log("\n  Login verification (anon key, real sign-in path):");
  for (const r of results) {
    console.log(`    ${r.ok ? "PASS" : "FAIL"}  ${r.email}${r.ok ? "" : `  — ${r.reason}`}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n  ${results.length - failed.length}/${results.length} logins succeeded.\n`);
  return failed.length === 0;
}

async function main() {
  const users = await resolveUsers();
  console.log(`[qa-password] all ${users.length} QA users found.`);

  if (verifyOnly) {
    console.log("\n  VERIFY ONLY — no password is written.");
    const verified = reportLogins(await verifyLogins(users));
    reportAppReadiness(await inspectAppReadiness(users));
    process.exit(verified ? 0 : 1);
  }

  if (!confirmed) {
    console.log("\n  DRY RUN — nothing written. Pass --confirm to apply.\n");
    console.log("  Would set the password of exactly these auth users to STAGING_QA_PASSWORD:");
    for (const u of users) console.log(`    ${u.email}`);
    console.log("\n  Would NOT touch: organizations, assets, qr_links, rental sessions,");
    console.log("  submissions, documents, storage objects, or any other auth user.\n");
    process.exit(0);
  }

  for (const u of users) {
    const { error } = await admin.auth.admin.updateUserById(u.id, {
      password,
      // Confirm alongside the reset: staging has no email provider, so an unconfirmed account could
      // never complete a confirmation link. Idempotent for already-confirmed users.
      email_confirm: true,
    });
    if (error) throw new Error(`updating ${u.email} failed: ${error.message}`);
    console.log(`  updated  ${u.email}`);
  }

  const ok = reportLogins(await verifyLogins(users));
  reportAppReadiness(await inspectAppReadiness(users));
  if (!ok) {
    console.error("  Passwords were written but at least one login still fails — investigate before use.\n");
    process.exit(1);
  }
  console.log("  Staging QA logins are working. No other staging data was modified.\n");
}

main().catch((err) => {
  // Errors from this script carry provider messages and ids only — never the password.
  console.error(`\n[qa-password] FAILED: ${err.message}\n`);
  process.exit(1);
});
