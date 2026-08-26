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

// ---- The blast radius: exactly two organization ids -------------------------
// Org A is the main QA tenant. Org B exists solely so cross-tenant denial can be exercised for real
// (an RLS test needs a second tenant to be denied *from*). Every write and delete below is scoped to
// one of these two ids — the script never issues an unscoped statement.
const QA_ORG_ID = "5ac00000-0000-4000-8000-00000057a610";
const QA_ORG_B_ID = "5ac00000-0000-4000-8000-00000057a620";
const QA_ASSET_PUBLIC = "5ac00000-0000-4000-8000-00000057a611";
const QA_ASSET_RENTED = "5ac00000-0000-4000-8000-00000057a612";
const QA_SESSION_ID = "5ac00000-0000-4000-8000-00000057a613";
const QA_ASSET_DRAFT = "5ac00000-0000-4000-8000-00000057a614";
const QA_ASSET_B = "5ac00000-0000-4000-8000-00000057a621";
const QA_DOC_PUBLIC = "5ac00000-0000-4000-8000-00000057a615";
const QA_DOC_PRIVATE = "5ac00000-0000-4000-8000-00000057a616";
const QA_ORG_NAME = "Mulemark Staging QA (test data — not a customer)";
const QA_ORG_SLUG = "staging-qa";
const QA_ORG_B_NAME = "Mulemark Staging QA — Org B (cross-tenant test)";
const QA_ORG_B_SLUG = "staging-qa-b";

const ORG_IDS = [QA_ORG_ID, QA_ORG_B_ID];

/**
 * Short codes. `public` and `rented` are ACTIVE; `disabled` is an inactive link (its scan page must
 * report "not available" without disclosing why); `orgb` belongs to the second tenant.
 *
 * `isolation` is the Preview-isolation probe: it exists ONLY in staging, so a Preview deployment that
 * resolves it is provably reading the staging database. See docs/STAGING_ENVIRONMENT_SETUP.md.
 */
export const QA_SHORT_CODES = {
  public: "stg-qa-public",
  rented: "stg-qa-rented",
  disabled: "stg-qa-disabled",
  orgb: "stg-qa-orgb",
  isolation: "stg-only-isolation-probe",
};

const QA_USERS = [
  { email: "qa.owner@mulemark-staging.invalid", role: "platform_owner", org: null, name: "QA Platform Owner (staging test)" },
  { email: "qa.admin@mulemark-staging.invalid", role: "customer_admin", org: QA_ORG_ID, name: "QA Customer Admin (staging test)" },
  { email: "qa.staff@mulemark-staging.invalid", role: "customer_staff", org: QA_ORG_ID, name: "QA Customer Staff (staging test)" },
  // Second tenant — the "other side" of every cross-tenant assertion.
  { email: "qa.admin.orgb@mulemark-staging.invalid", role: "customer_admin", org: QA_ORG_B_ID, name: "QA Org-B Admin (cross-tenant test)" },
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
  console.log("  Would create, under exactly two organization ids:");
  console.log(`    org A      ${QA_ORG_ID}  "${QA_ORG_NAME}"`);
  console.log(`    org B      ${QA_ORG_B_ID}  "${QA_ORG_B_NAME}"`);
  console.log(`    assets     org A: public (published) + rented (published) + draft (unpublished)`);
  console.log(`               org B: 1 public asset (cross-tenant target)`);
  console.log(`    QR codes   ${QA_SHORT_CODES.public} (active), ${QA_SHORT_CODES.rented} (active),`);
  console.log(`               ${QA_SHORT_CODES.disabled} (DISABLED), ${QA_SHORT_CODES.orgb} (org B),`);
  console.log(`               ${QA_SHORT_CODES.isolation} (staging-only isolation probe)`);
  console.log(`    documents  1 public + 1 private (org A)`);
  console.log(`    session    1 active rental session on the rented asset`);
  console.log(`    submissions damage (new) + support (reviewed) + return checklist (resolved)`);
  for (const u of QA_USERS) console.log(`    login      ${u.email}  (${u.role})`);
  console.log("\n  Existing rows for those two organization ids would be deleted first (idempotent).\n");
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
  // Scoped to the two QA org ids only — children cascade. Never an unscoped delete.
  const { error } = await db.from("organizations").delete().in("id", ORG_IDS);
  if (error) throw new Error(`cleanup failed: ${error.message}`);
}

async function seed() {
  await assertSchemaPresent();
  await cleanup();

  // Org A has exports OFF (so the disabled-export redirect is testable); org B has them ON (so the
  // enabled path is testable too). One seed covers both sides of the export gate.
  const orgs = [
    {
      id: QA_ORG_ID, name: QA_ORG_NAME, slug: QA_ORG_SLUG, status: "active", asset_limit: null,
      plan_name: "Staging QA (not a real plan)",
      customer_exports_enabled: false, export_submissions_enabled: false,
    },
    {
      id: QA_ORG_B_ID, name: QA_ORG_B_NAME, slug: QA_ORG_B_SLUG, status: "active", asset_limit: null,
      plan_name: "Staging QA org B (not a real plan)",
      customer_exports_enabled: true, export_assets_enabled: true, export_submissions_enabled: true,
    },
  ];
  // Insert one at a time: a batched insert unions the keys and sends NULL for any key absent from a
  // row, tripping the NOT NULL defaults on the export flags.
  for (const o of orgs) {
    const { error } = await db.from("organizations").insert(o);
    if (error) throw new Error(`seed org ${o.slug}: ${error.message}`);
  }

  for (const u of QA_USERS) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      password,
      // Confirmed up front: QA logins must work with password only, because staging never sends
      // notification email — RESEND_* is unset there AND, since B4, the notifier refuses to send from
      // a preview deployment regardless of configuration (lib/notifications/send.ts).
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`seed user ${u.email}: ${error?.message}`);
    const { error: pErr } = await db.from("profiles").insert({
      auth_user_id: data.user.id,
      organization_id: u.org,
      name: u.name,
      email: u.email,
      role: u.role,
      status: "active",
    });
    if (pErr) throw new Error(`seed profile ${u.email}: ${pErr.message}`);
  }

  // Representative matrix: published + draft pages, public + private assets, across both tenants.
  const assets = [
    { id: QA_ASSET_PUBLIC, org: QA_ORG_ID, code: "STG-QA-PUB", name: "Staging QA Trailer (public)", visibility: "public", published: true, category: "Utility Trailer" },
    { id: QA_ASSET_RENTED, org: QA_ORG_ID, code: "STG-QA-RNT", name: "Staging QA Trailer (rented)", visibility: "public", published: true, category: "Utility Trailer" },
    // Draft page + private asset — the scan page must refuse this without disclosing why.
    { id: QA_ASSET_DRAFT, org: QA_ORG_ID, code: "STG-QA-DRAFT", name: "Staging QA Excavator (draft)", visibility: "private", published: false, category: "Excavator" },
    { id: QA_ASSET_B, org: QA_ORG_B_ID, code: "STG-QB-PUB", name: "Org B Generator (cross-tenant target)", visibility: "public", published: true, category: "Portable Generator" },
  ];
  for (const a of assets) {
    const { error: aErr } = await db.from("assets").insert({
      id: a.id,
      organization_id: a.org,
      asset_code: a.code,
      asset_name: a.name,
      category: a.category,
      public_status: a.visibility,
      return_inspection_template_key: "utility_trailer",
      internal_notes: "STAGING TEST DATA — never a real customer record.",
    });
    if (aErr) throw new Error(`seed asset ${a.code}: ${aErr.message}`);

    const { error: pageErr } = await db.from("equipment_pages").insert({
      asset_id: a.id,
      organization_id: a.org,
      headline: a.published ? "STAGING TEST PAGE — not real equipment." : "STAGING DRAFT PAGE — unpublished.",
      quick_start_text: "Disposable staging content used to exercise the scan page.",
      safety_notes: "Staging test content. Wear a hard hat and hi-vis.",
      fuel_power_notes: "Staging test content. Diesel only.",
      return_notes: "Staging test content. Return with a full tank.",
      troubleshooting_notes: "Staging test content. Check the battery isolator.",
      emergency_notes: "Staging test content. Call the number on the tag.",
      is_published: a.published,
    });
    if (pageErr) throw new Error(`seed equipment_page ${a.code}: ${pageErr.message}`);
  }

  // QR links: active, DISABLED, org-B, and the staging-only isolation probe. The `public_url` column is
  // a placeholder — the app always COMPUTES the live URL from NEXT_PUBLIC_SITE_URL + short_code
  // (lib/qr/url.ts), so these stay valid across a domain change and are never used for a scan.
  const qrLinks = [
    { org: QA_ORG_ID, asset: QA_ASSET_PUBLIC, short: QA_SHORT_CODES.public, status: "active" },
    { org: QA_ORG_ID, asset: QA_ASSET_RENTED, short: QA_SHORT_CODES.rented, status: "active" },
    { org: QA_ORG_ID, asset: QA_ASSET_DRAFT, short: QA_SHORT_CODES.disabled, status: "disabled" },
    { org: QA_ORG_B_ID, asset: QA_ASSET_B, short: QA_SHORT_CODES.orgb, status: "active" },
    // Exists ONLY in staging — resolving this on a deployment proves it reads the staging database.
    { org: QA_ORG_ID, asset: QA_ASSET_PUBLIC, short: QA_SHORT_CODES.isolation, status: "active" },
  ];
  for (const q of qrLinks) {
    const { error } = await db.from("qr_links").insert({
      organization_id: q.org,
      asset_id: q.asset,
      short_code: q.short,
      public_url: `https://staging.invalid/t/${q.short}`,
      status: q.status,
    });
    if (error) throw new Error(`seed qr_link ${q.short}: ${error.message}`);
  }

  // Documents: one public (reachable from the scan page) and one private (admin-only, signed URL).
  // Storage OBJECTS are not uploaded here — the rows exercise visibility/RLS; media upload is a
  // separate operator/QA step.
  const docs = [
    { id: QA_DOC_PUBLIC, asset: QA_ASSET_PUBLIC, title: "Staging QA operator manual (public)", visibility: "public", path: `org/${QA_ORG_ID}/staging-public-manual.pdf` },
    { id: QA_DOC_PRIVATE, asset: QA_ASSET_PUBLIC, title: "Staging QA internal notes (private)", visibility: "private", path: `org/${QA_ORG_ID}/staging-private-manual.pdf` },
  ];
  for (const d of docs) {
    const { error } = await db.from("documents").insert({
      id: d.id,
      organization_id: QA_ORG_ID,
      asset_id: d.asset,
      title: d.title,
      document_type: "manual",
      storage_path: d.path,
      visibility: d.visibility,
    });
    if (error) throw new Error(`seed document ${d.title}: ${error.message}`);
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

  // Representative submissions across form types and statuses, so the inbox, filters, badges and
  // status transitions all have something real to act on. Org B gets one so cross-tenant denial has a
  // target that actually exists.
  const submissions = [
    { org: QA_ORG_ID, asset: QA_ASSET_PUBLIC, form_type: "damage_report", status: "new", by: "Staging QA Renter", data: { description: "Staging test — cracked lens." } },
    { org: QA_ORG_ID, asset: QA_ASSET_PUBLIC, form_type: "support_request", status: "reviewed", by: "Staging QA Renter", data: { description: "Staging test — how do the ramps fold?" } },
    { org: QA_ORG_ID, asset: QA_ASSET_RENTED, form_type: "return_checklist", status: "resolved", by: "Staging QA Renter", data: { description: "Staging test — returned clean." } },
    { org: QA_ORG_B_ID, asset: QA_ASSET_B, form_type: "damage_report", status: "new", by: "Org B Renter", data: { description: "Staging test — org B record." } },
  ];
  for (const s of submissions) {
    const { error } = await db.from("form_submissions").insert({
      organization_id: s.org,
      asset_id: s.asset,
      form_type: s.form_type,
      status: s.status,
      submitted_by_name: s.by,
      submission_data_json: s.data,
    });
    if (error) throw new Error(`seed submission ${s.form_type}: ${error.message}`);
  }

  console.log("\n[staging-seed] applied:");
  console.log(`  org A      ${QA_ORG_ID}  "${QA_ORG_NAME}"   (exports OFF)`);
  console.log(`  org B      ${QA_ORG_B_ID}  "${QA_ORG_B_NAME}"   (exports ON)`);
  console.log(`  assets     STG-QA-PUB (public), STG-QA-RNT (rented), STG-QA-DRAFT (private/draft), STG-QB-PUB (org B)`);
  console.log(`  QR codes   /t/${QA_SHORT_CODES.public} (active)`);
  console.log(`             /t/${QA_SHORT_CODES.rented} (active)`);
  console.log(`             /t/${QA_SHORT_CODES.disabled} (DISABLED — must read "not available")`);
  console.log(`             /t/${QA_SHORT_CODES.orgb} (org B)`);
  console.log(`             /t/${QA_SHORT_CODES.isolation} (staging-only isolation probe)`);
  console.log(`  documents  1 public + 1 private (org A)`);
  console.log(`  session    active on STG-QA-RNT`);
  console.log(`  submissions 4 (damage/new, support/reviewed, return/resolved, org-B damage/new)`);
  for (const u of QA_USERS) console.log(`  login      ${u.email}  (${u.role})`);
  console.log("\n  Password: the value of STAGING_QA_PASSWORD (not printed).");
  console.log("  Re-run any time — this is idempotent.\n");
  console.log("  Isolation probe: /t/" + QA_SHORT_CODES.isolation + " exists ONLY in staging.");
  console.log("  A deployment that resolves it is provably reading the staging database.\n");
  console.log("  Next: verify the deployment per docs/STAGING_ENVIRONMENT_SETUP.md");
  console.log("  (public scan, RLS, staff workflow, owner workflow).\n");
}

seed().catch((err) => {
  console.error(`\n[staging-seed] ${err.message}\n`);
  process.exit(1);
});
