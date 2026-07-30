#!/usr/bin/env node
/**
 * Staging bootstrap seeder (Phase B1A — PREPARED, NOT YET RUN).
 *
 * Creates the deterministic QA dataset a staging project needs: one organization, assets with published
 * equipment pages, test QR short codes, an active rental session, and owner / customer-admin /
 * customer-staff QA logins. It is written now so Phase B1B is a reviewed, repeatable procedure rather
 * than improvised SQL against a fresh project.
 *
 * IT DOES NOT APPLY MIGRATIONS. Schema is the operator's step, run deliberately with the linked-project
 * guard; this script prints those commands and refuses to continue if the schema is absent.
 *
 * FAIL-CLOSED PRECONDITIONS — all four must hold or nothing is written:
 *   1. `MULEMARK_TARGET=staging` is set explicitly. The target is never inferred.
 *   2. `assertTarget("staging", …)` resolves the configured Supabase URL to the ref declared in
 *      `STAGING_SUPABASE_REF`. The known production ref can never satisfy this.
 *   3. `--confirm` is passed. A bare invocation reports what it *would* do and exits 0.
 *   4. `STAGING_QA_PASSWORD` is supplied through the environment. Never a tracked file, never a default,
 *      never printed or logged.
 *
 * IDEMPOTENT: every entity uses a fixed UUID under one organization id, and the run begins by deleting
 * that single organization (children cascade) plus its QA auth users. It never issues an unscoped delete
 * and never touches another organization's rows.
 *
 * Usage:
 *   MULEMARK_TARGET=staging STAGING_SUPABASE_REF=<ref> STAGING_QA_PASSWORD=<pw> \
 *     npm run staging:seed -- --confirm
 */
import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";

// ---- The single blast radius -------------------------------------------------
const QA_ORG_ID = "5ac00000-0000-4000-8000-00000057a610";
const QA_ASSET_PUBLIC = "5ac00000-0000-4000-8000-00000057a611";
const QA_ASSET_RENTED = "5ac00000-0000-4000-8000-00000057a612";
const QA_SESSION_ID = "5ac00000-0000-4000-8000-00000057a613";
const QA_ORG_NAME = "Mulemark Staging QA (test data — not a customer)";
const QA_ORG_SLUG = "staging-qa";

export const QA_SHORT_CODES = { public: "stg-qa-public", rented: "stg-qa-rented" };

const QA_USERS = [
  { email: "qa.owner@mulemark-staging.invalid", role: "platform_owner", orgScoped: false, name: "QA Platform Owner (staging test)" },
  { email: "qa.admin@mulemark-staging.invalid", role: "customer_admin", orgScoped: true, name: "QA Customer Admin (staging test)" },
  { email: "qa.staff@mulemark-staging.invalid", role: "customer_staff", orgScoped: true, name: "QA Customer Staff (staging test)" },
];

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");

function fail(msg, extra = []) {
  console.error(`\n[staging-seed] REFUSING TO RUN\n\n  ${msg}\n`);
  for (const line of extra) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

// ---- Preconditions -----------------------------------------------------------
const target = process.env.MULEMARK_TARGET ?? "";
if (target !== "staging") {
  fail(
    `MULEMARK_TARGET must be exactly "staging" (got ${target ? `"${target}"` : "unset"}).`,
    [
      "The target is never inferred — it must be stated. This script writes QA users and",
      "test organizations, which must never reach production.",
    ]
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const stagingRef = process.env.STAGING_SUPABASE_REF ?? "";
if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set (the staging key; never printed).");

let resolved;
try {
  resolved = assertTarget("staging", { supabaseUrl, expectedStagingRef: stagingRef || null });
} catch (err) {
  fail(err.message, ["See docs/STAGING_ENVIRONMENT_SETUP.md."]);
}

const password = process.env.STAGING_QA_PASSWORD ?? "";
if (!password) {
  fail("STAGING_QA_PASSWORD is not set.", [
    "Supply the QA password through the environment only — never a tracked file, never a",
    "hard-coded default. It is not printed or logged by this script.",
  ]);
}
if (password.length < 12) fail("STAGING_QA_PASSWORD is too short (min 12 characters).");

console.log(`\n[staging-seed] target verified: STAGING (host: ${resolved.host}, ref: ${resolved.ref})`);

if (!confirmed) {
  console.log("\n  DRY RUN — nothing written. Pass --confirm to apply.\n");
  console.log("  Would create, all under one organization:");
  console.log(`    org        ${QA_ORG_ID}  "${QA_ORG_NAME}"`);
  console.log(`    assets     2 (public + rented) with published equipment pages`);
  console.log(`    QR codes   ${QA_SHORT_CODES.public}, ${QA_SHORT_CODES.rented}  (TEST short codes)`);
  console.log(`    session    1 active rental session on the rented asset`);
  for (const u of QA_USERS) console.log(`    login      ${u.email}  (${u.role})`);
  console.log("\n  Existing rows for this organization id would be deleted first (idempotent).\n");
  process.exit(0);
}

// ---- Apply -------------------------------------------------------------------
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  return data?.users.find((u) => u.email === email) ?? null;
}

async function assertSchemaPresent() {
  const { error } = await db.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
  if (error) {
    fail(`the schema does not look present on this project (${error.message}).`, [
      "Apply migrations first, with the linked-project guard:",
      `  node scripts/check-linked-project.mjs --expect=${resolved.ref}`,
      "  npx supabase migration list",
      "  npx supabase db push --dry-run",
      "  npx supabase db push",
      "This script never applies migrations.",
    ]);
  }
}

async function cleanup() {
  for (const u of QA_USERS) {
    const existing = await findUserByEmail(u.email);
    if (existing) await db.auth.admin.deleteUser(existing.id);
  }
  const { error } = await db.from("organizations").delete().eq("id", QA_ORG_ID);
  if (error) throw new Error(`cleanup failed: ${error.message}`);
}

async function seed() {
  await assertSchemaPresent();
  await cleanup();

  const { error: orgErr } = await db.from("organizations").insert({
    id: QA_ORG_ID,
    name: QA_ORG_NAME,
    slug: QA_ORG_SLUG,
    status: "active",
    asset_limit: null,
    plan_name: "Staging QA (not a real plan)",
    customer_exports_enabled: false,
    export_submissions_enabled: false,
  });
  if (orgErr) throw new Error(`seed org: ${orgErr.message}`);

  for (const u of QA_USERS) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`seed user ${u.email}: ${error?.message}`);
    const { error: pErr } = await db.from("profiles").insert({
      auth_user_id: data.user.id,
      organization_id: u.orgScoped ? QA_ORG_ID : null,
      name: u.name,
      email: u.email,
      role: u.role,
      status: "active",
    });
    if (pErr) throw new Error(`seed profile ${u.email}: ${pErr.message}`);
  }

  const assets = [
    { id: QA_ASSET_PUBLIC, code: "STG-QA-PUB", name: "Staging QA Trailer (public)", short: QA_SHORT_CODES.public },
    { id: QA_ASSET_RENTED, code: "STG-QA-RNT", name: "Staging QA Trailer (rented)", short: QA_SHORT_CODES.rented },
  ];
  for (const a of assets) {
    const { error: aErr } = await db.from("assets").insert({
      id: a.id,
      organization_id: QA_ORG_ID,
      asset_code: a.code,
      asset_name: a.name,
      category: "Utility Trailer",
      public_status: "public",
      return_inspection_template_key: "utility_trailer",
    });
    if (aErr) throw new Error(`seed asset ${a.code}: ${aErr.message}`);

    const { error: pageErr } = await db.from("equipment_pages").insert({
      asset_id: a.id,
      organization_id: QA_ORG_ID,
      headline: "STAGING TEST PAGE — not real equipment.",
      quick_start_text: "Disposable staging content used to exercise the scan page.",
      safety_notes: "Staging test content. Wear a hard hat and hi-vis.",
      fuel_power_notes: "Staging test content. Diesel only.",
      return_notes: "Staging test content. Return with a full tank.",
      troubleshooting_notes: "Staging test content. Check the battery isolator.",
      emergency_notes: "Staging test content. Call the number on the tag.",
      is_published: true,
    });
    if (pageErr) throw new Error(`seed equipment_page ${a.code}: ${pageErr.message}`);

    const { error: qrErr } = await db.from("qr_links").insert({
      organization_id: QA_ORG_ID,
      asset_id: a.id,
      short_code: a.short,
      // Placeholder only — the app always computes the live URL from NEXT_PUBLIC_SITE_URL + short_code,
      // so this value is never used for a scan and stays valid across a domain change.
      public_url: `https://staging.invalid/t/${a.short}`,
      status: "active",
    });
    if (qrErr) throw new Error(`seed qr_link ${a.short}: ${qrErr.message}`);
  }

  // An active rental session on the second asset — makes the acknowledgement prompt and the staff
  // return workflow reachable without further setup.
  const { error: sErr } = await db.from("asset_rental_sessions").insert({
    id: QA_SESSION_ID,
    organization_id: QA_ORG_ID,
    asset_id: QA_ASSET_RENTED,
    status: "active",
    renter_label: "Staging QA Renter (test)",
    rental_reference: "STG-QA",
  });
  if (sErr) throw new Error(`seed rental session: ${sErr.message}`);
  const { error: ptrErr } = await db
    .from("assets")
    .update({ active_rental_session_id: QA_SESSION_ID })
    .eq("id", QA_ASSET_RENTED);
  if (ptrErr) throw new Error(`seed session pointer: ${ptrErr.message}`);

  console.log("\n[staging-seed] applied:");
  console.log(`  org        ${QA_ORG_ID}  "${QA_ORG_NAME}"`);
  console.log(`  assets     STG-QA-PUB (public), STG-QA-RNT (rented)`);
  console.log(`  QR codes   /t/${QA_SHORT_CODES.public}, /t/${QA_SHORT_CODES.rented}`);
  console.log(`  session    active on STG-QA-RNT`);
  for (const u of QA_USERS) console.log(`  login      ${u.email}  (${u.role})`);
  console.log("\n  Password: the value of STAGING_QA_PASSWORD (not printed).");
  console.log("  Re-run any time — this is idempotent.\n");
  console.log("  Next: verify the deployment per docs/STAGING_ENVIRONMENT_SETUP.md");
  console.log("  (public scan, RLS, staff workflow, owner workflow).\n");
}

seed().catch((err) => {
  console.error(`\n[staging-seed] ${err.message}\n`);
  process.exit(1);
});
