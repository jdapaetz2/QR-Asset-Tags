#!/usr/bin/env node
/**
 * Production QA fixture provisioning (Phase C0) — OPERATOR-APPROVED, one-time, strictly additive.
 *
 * WHY THIS EXISTS: Phase C0 must baseline the AUTHENTICATED Production request path, and C0's own rules
 * forbid a runner from silently skipping a route it could not measure. Production had no QA account and
 * no test-only short code, so those routes were unmeasurable. The operator explicitly approved creating
 * a dedicated, clearly-labelled QA organization for this purpose.
 *
 * HOW THIS DIFFERS FROM THE STAGING SEEDER — read before changing anything:
 *   The staging seeder is idempotent by DELETING its organizations and recreating them. That is safe on
 *   a disposable project and catastrophic on Production. This script therefore **never deletes and never
 *   updates anything it did not create**. Every write is an insert guarded by an existence check on a
 *   fixed UUID, so a second run is a no-op rather than a re-creation.
 *
 * FAIL-CLOSED PRECONDITIONS — all must hold or nothing is written:
 *   1. `--target=production` stated explicitly on the command line. Never inferred.
 *   2. `--confirm`. A bare run is a dry run that reports the current organization count and what it
 *      would create.
 *   3. The resolved Supabase project ref must equal EXPECTED_PRODUCTION_REF below, and
 *      `assertTarget("production", …)` must agree — which refuses the staging project BY NAME.
 *   4. `PRODUCTION_QA_PASSWORD` supplied through the environment. Never argv, never printed.
 *
 * BLAST RADIUS: one organization id, one auth user, one asset, one equipment page, one QR link. Nothing
 * outside those ids is read for mutation or written.
 *
 * RETENTION: the fixtures are permanent by default so the baseline stays repeatable across phases. To
 * remove them, delete the organization row (children cascade) and the auth user — both ids are printed
 * by this script and recorded in docs/PHASE_C_BASELINE.md.
 *
 * TWO CONSEQUENCES, STATED NOT BURIED:
 *   - the QA asset has QR coverage, so it COUNTS AS A COVERED ASSET in the commercial model;
 *   - every measured scan writes a `scan_events` row — to the QA asset only, never a customer's.
 *
 * Usage:
 *   npm run production:seed-qa                                  # dry run
 *   npm run production:seed-qa -- --target=production --confirm # apply
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";

/** Ignored env file (matched by the `.env*` gitignore rule) that carries the Production QA inputs. */
const PERF_ENV_FILE = ".env.production-perf.local";

/** The live production project. Public by construction (it is the host in NEXT_PUBLIC_SUPABASE_URL). */
const EXPECTED_PRODUCTION_REF = "apeiswnkheiwrpvumder";
/** Passed to assertTarget so the staging project is recognised and refused by name, not by accident. */
const KNOWN_STAGING_REF = "kwserenxwjxozztyigmw";

// ---- The entire blast radius: fixed ids, invented for this purpose ------------
const QA_ORG_ID = "c0000000-0000-4000-8000-00000000c0a1";
const QA_ASSET_ID = "c0000000-0000-4000-8000-00000000c0a2";
const QA_ORG_NAME = "Mulemark Production QA — test data, not a customer";
const QA_ORG_SLUG = "production-qa-do-not-use";
/** Deliberately self-describing: anyone who sees this code in a log knows it is not a customer tag. */
const QA_SHORT_CODE = "prod-qa-perf-probe";
const QA_EMAIL = "qa.perf@mulemark-production.invalid";

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const initPassword = args.includes("--init-password");
const targetArg = (args.find((a) => a.startsWith("--target=")) ?? "").split("=")[1] ?? "";

/**
 * Generate the QA password and write it straight to the ignored env file. It is never printed, never
 * returned to a caller, and never placed on a command line — the operator does not need to see it, and
 * anything that does not need to see a credential should not.
 */
function initPasswordFile() {
  if (existsSync(PERF_ENV_FILE) && /^PRODUCTION_QA_PASSWORD=.+$/m.test(readFileSync(PERF_ENV_FILE, "utf8"))) {
    console.log(`\n[production-qa] ${PERF_ENV_FILE} already carries PRODUCTION_QA_PASSWORD — leaving it alone.\n`);
    return;
  }
  // 32 bytes of base64url: ~192 bits, no shell-hostile characters.
  const secret = randomBytes(32).toString("base64url");
  const block =
    `\n# Phase C0 Production QA fixture credentials. Generated locally; never committed (.env* is ignored).\n` +
    `PRODUCTION_QA_EMAIL=${QA_EMAIL}\n` +
    `PRODUCTION_QA_SHORT_CODE=${QA_SHORT_CODE}\n` +
    `PRODUCTION_QA_PASSWORD=${secret}\n`;
  appendFileSync(PERF_ENV_FILE, block, "utf8");
  console.log(`\n[production-qa] wrote PRODUCTION_QA_PASSWORD to ${PERF_ENV_FILE} (value not shown).\n`);
}

function fail(msg, extra = []) {
  console.error(`\n[production-qa] REFUSING TO RUN\n\n  ${msg}\n`);
  for (const line of extra) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

// ---- Preconditions -------------------------------------------------------------
if (initPassword) {
  initPasswordFile();
  process.exit(0);
}

if (confirmed && targetArg !== "production") {
  fail(`--target must be stated explicitly as "production" (got ${targetArg ? `"${targetArg}"` : "nothing"}).`, [
    "The target is never inferred. This script writes to the LIVE project.",
  ]);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set (value never read or printed).");

let resolved;
try {
  // Declaring the staging ref lets assertTarget positively RECOGNISE staging and refuse it by name,
  // rather than merely failing to recognise it.
  resolved = assertTarget("production", { supabaseUrl, expectedStagingRef: KNOWN_STAGING_REF });
} catch (err) {
  fail(err.message);
}
if (resolved.ref !== EXPECTED_PRODUCTION_REF) {
  fail(`resolved project ref ${resolved.ref} is not the expected production ref.`, [
    "This script is pinned to one project. Refs are public, not secrets.",
  ]);
}

const password = process.env.PRODUCTION_QA_PASSWORD ?? "";
if (confirmed && !password) {
  fail("PRODUCTION_QA_PASSWORD is not set.", [
    "Supply it through the environment only — never as a command-line argument.",
    "It is not printed or logged by this script.",
  ]);
}
if (confirmed && password.length < 16) {
  fail("PRODUCTION_QA_PASSWORD is too short (min 16 characters for a Production account).");
}

console.log(`\n[production-qa] target verified: PRODUCTION (host: ${resolved.host}, ref: ${resolved.ref})`);

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data?.users.find((u) => u.email === email) ?? null;
}

/** Read-only survey. Reports scale only — never customer names or any row content. */
async function survey() {
  const { count: orgCount, error } = await db
    .from("organizations")
    .select("id", { head: true, count: "exact" });
  if (error) throw new Error(`survey failed: ${error.message}`);
  const { data: existingOrg } = await db
    .from("organizations")
    .select("id")
    .eq("id", QA_ORG_ID)
    .maybeSingle();
  const existingUser = await findUserByEmail(QA_EMAIL);
  return { orgCount: orgCount ?? 0, orgExists: Boolean(existingOrg), userExists: Boolean(existingUser) };
}

const state = await survey();
console.log(`[production-qa] existing organizations on this project: ${state.orgCount}`);
console.log(`[production-qa] QA organization present: ${state.orgExists ? "yes" : "no"}`);
console.log(`[production-qa] QA user present: ${state.userExists ? "yes" : "no"}`);

if (!confirmed) {
  console.log("\n  DRY RUN — nothing written. Pass --target=production --confirm to apply.\n");
  console.log("  Would create, ONLY if each is absent (never deleting, never updating):");
  console.log(`    organization  ${QA_ORG_ID}  "${QA_ORG_NAME}"`);
  console.log(`    asset         ${QA_ASSET_ID}  code PROD-QA-PERF`);
  console.log(`    equipment page (published, test content)`);
  console.log(`    qr_link       short code "${QA_SHORT_CODE}" (active)`);
  console.log(`    auth user     ${QA_EMAIL} (customer_admin of the QA org)`);
  console.log("\n  Touches nothing else. No existing row is read for mutation.\n");
  process.exit(0);
}

// ---- Apply — additive only ------------------------------------------------------
async function ensureOrg() {
  if (state.orgExists) return "already present";
  const { error } = await db.from("organizations").insert({
    id: QA_ORG_ID,
    name: QA_ORG_NAME,
    slug: QA_ORG_SLUG,
    status: "active",
    plan_name: "Internal QA (not a real plan)",
    asset_limit: null,
    customer_exports_enabled: false,
    export_submissions_enabled: false,
  });
  if (error) throw new Error(`create org: ${error.message}`);
  return "created";
}

async function ensureAsset() {
  const { data } = await db.from("assets").select("id").eq("id", QA_ASSET_ID).maybeSingle();
  if (data) return "already present";
  const { error } = await db.from("assets").insert({
    id: QA_ASSET_ID,
    organization_id: QA_ORG_ID,
    asset_code: "PROD-QA-PERF",
    asset_name: "Production QA performance probe (not real equipment)",
    category: "Internal QA",
    public_status: "public",
    return_inspection_template_key: "utility_trailer",
    internal_notes: "PRODUCTION QA FIXTURE — Phase C0 performance baseline. Never a real customer record.",
  });
  if (error) throw new Error(`create asset: ${error.message}`);
  return "created";
}

async function ensurePage() {
  const { data } = await db
    .from("equipment_pages")
    .select("asset_id")
    .eq("asset_id", QA_ASSET_ID)
    .maybeSingle();
  if (data) return "already present";
  const { error } = await db.from("equipment_pages").insert({
    asset_id: QA_ASSET_ID,
    organization_id: QA_ORG_ID,
    headline: "PRODUCTION QA TEST PAGE — not real equipment.",
    quick_start_text: "Internal performance probe. This page exists only to measure the scan route.",
    safety_notes: "Test content. Not operating guidance.",
    is_published: true,
  });
  if (error) throw new Error(`create equipment page: ${error.message}`);
  return "created";
}

async function ensureQrLink() {
  const { data } = await db
    .from("qr_links")
    .select("id")
    .eq("short_code", QA_SHORT_CODE)
    .maybeSingle();
  if (data) return "already present";
  const { error } = await db.from("qr_links").insert({
    organization_id: QA_ORG_ID,
    asset_id: QA_ASSET_ID,
    short_code: QA_SHORT_CODE,
    public_url: `https://mulemark.io/t/${QA_SHORT_CODE}`,
    status: "active",
  });
  if (error) throw new Error(`create qr_link: ${error.message}`);
  return "created";
}

async function ensureUser() {
  const existing = await findUserByEmail(QA_EMAIL);
  if (existing) return "already present";
  const { data, error } = await db.auth.admin.createUser({
    email: QA_EMAIL,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`create user: ${error?.message}`);
  const { error: pErr } = await db.from("profiles").insert({
    auth_user_id: data.user.id,
    organization_id: QA_ORG_ID,
    name: "Production QA (performance baseline)",
    email: QA_EMAIL,
    role: "customer_admin",
    status: "active",
  });
  if (pErr) throw new Error(`create profile: ${pErr.message}`);
  return "created";
}

const steps = [
  ["organization", ensureOrg],
  ["asset", ensureAsset],
  ["equipment page", ensurePage],
  ["qr link", ensureQrLink],
  ["auth user + profile", ensureUser],
];

console.log("");
for (const [label, fn] of steps) {
  const outcome = await fn();
  console.log(`  ${outcome === "created" ? "created " : "existing"}  ${label}`);
}

console.log(`
[production-qa] done. Fixtures (all clearly labelled test data):

  organization id   ${QA_ORG_ID}
  asset id          ${QA_ASSET_ID}
  short code        ${QA_SHORT_CODE}   →  https://mulemark.io/t/${QA_SHORT_CODE}
  QA login          ${QA_EMAIL}

RETENTION: these are permanent so the baseline stays repeatable. To remove them, delete the
organization row (children cascade) and the auth user. Both ids are above and in
docs/PHASE_C_BASELINE.md.

NOTE: the QA asset has QR coverage, so it counts as a COVERED ASSET in the commercial model, and
each measured scan writes a scan_events row to this asset only.
`);
