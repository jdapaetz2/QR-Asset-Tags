#!/usr/bin/env node
/**
 * A6.3 staging QA fixture (seed | report | cleanup).
 *
 * Phase A6.3 runs device/performance QA against a TEMPORARY Vercel staging deployment that shares its
 * Supabase project with production. To keep QA data from ever masquerading as customer data, every row
 * this script touches lives under ONE fixed, loudly-labelled organization id.
 *
 * SAFE BY CONSTRUCTION:
 *   - Every insert/update/delete is scoped to QA_ORG_ID. The script never issues an unscoped delete and
 *     never touches another organization's rows.
 *   - `cleanup` deletes that single org (FK cascade) plus the two QA auth users, nothing else.
 *   - Org name/slug/asset/short-code all carry a visible "QA TEST" marker so the data is self-identifying
 *     in the dashboard.
 *   - QA logins use RFC-2606 `.invalid` addresses, which can never receive real mail — device QA must
 *     never depend on (or accidentally trigger) a real delivery.
 *   - The generated QA password is printed ONCE to stdout for the operator. It is never written to a
 *     file, a doc, or the repo. Keys are never printed — only the Supabase host.
 *
 * Usage:
 *   node scripts/qa/staging-qa-data.mjs seed      # idempotent: recreate the QA org + fixtures
 *   node scripts/qa/staging-qa-data.mjs report    # what exists + row counts (read-only)
 *   node scripts/qa/staging-qa-data.mjs cleanup   # remove the QA org + QA users
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (never printed).
 */
import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { assertTarget, classifyTarget } from "../lib/env-target.mjs";

// ---- The single blast radius -------------------------------------------------
export const QA_ORG_ID = "a6300000-0000-4000-8000-0000000a63a0";
const QA_ASSET_ID = "a6300000-0000-4000-8000-0000000a63a1";
const QA_SESSION_ID = "a6300000-0000-4000-8000-0000000a63a2";
const QA_ORG_NAME = "ZZ QA TEST ORG — A6.3 (disposable)";
const QA_ORG_SLUG = "zz-qa-test-a63";

/** Disposable test short code. Domain-independent: a later domain change keeps this code valid. */
export const QA_SHORT_CODE = "qa-a63-test";

const QA_USERS = [
  { key: "admin", email: "qa.admin.a63@mulemark-qa.invalid", role: "customer_admin", name: "QA Admin (A6.3 test)" },
  { key: "staff", email: "qa.staff.a63@mulemark-qa.invalid", role: "customer_staff", name: "QA Staff (A6.3 test)" },
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[qa-data] missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

/**
 * Resolve the client, but only after the caller has STATED which environment they mean.
 *
 * Phase A7 found this script could write to any project the shell happened to point at — including
 * production — with no check at all. The target is now never inferred: `MULEMARK_TARGET` must be set
 * explicitly and must match the project the URL actually resolves to. Aiming this at production is
 * still possible (that is where the A6.3 QA org lived) but now requires saying so out loud.
 */
function client() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const declared = process.env.MULEMARK_TARGET ?? "";
  const resolved = classifyTarget({
    supabaseUrl: url,
    expectedStagingRef: process.env.STAGING_SUPABASE_REF || null,
  });

  if (!declared) {
    console.error(
      `[qa-data] REFUSING TO RUN: MULEMARK_TARGET is not set.\n` +
        `  This shell resolves to ${resolved.target.toUpperCase()} (host: ${resolved.host}).\n` +
        `  Re-run with MULEMARK_TARGET=${resolved.target} if that is what you intend.\n` +
        `  The target is never inferred — see docs/STAGING_ENVIRONMENT_SETUP.md.`
    );
    process.exit(1);
  }

  try {
    assertTarget(declared, {
      supabaseUrl: url,
      expectedStagingRef: process.env.STAGING_SUPABASE_REF || null,
    });
  } catch (err) {
    console.error(`[qa-data] REFUSING TO RUN: ${err.message}`);
    process.exit(1);
  }

  // Host + classification only — never the key.
  console.log(`[qa-data] target: ${resolved.host} (${declared.toUpperCase()}, confirmed)`);
  if (declared === "production") {
    console.log("[qa-data] WARNING: writing QA fixtures into the PRODUCTION project.");
    console.log("[qa-data] Run `npm run qa:staging:data cleanup` when finished.");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function findUserByEmail(db, email) {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  return data?.users.find((u) => u.email === email) ?? null;
}

async function cleanup(db, { quiet = false } = {}) {
  for (const u of QA_USERS) {
    const existing = await findUserByEmail(db, u.email);
    if (existing) await db.auth.admin.deleteUser(existing.id);
  }
  // Scoped delete: this exact org id only. Child rows cascade.
  const { error } = await db.from("organizations").delete().eq("id", QA_ORG_ID);
  if (error) throw new Error(`cleanup failed: ${error.message}`);
  if (!quiet) console.log(`[qa-data] removed QA org ${QA_ORG_ID} and ${QA_USERS.length} QA users`);
}

async function seed(db) {
  await cleanup(db, { quiet: true });

  const { error: orgErr } = await db.from("organizations").insert({
    id: QA_ORG_ID,
    name: QA_ORG_NAME,
    slug: QA_ORG_SLUG,
    status: "active",
    asset_limit: null,
    plan_name: "QA (not a real plan)",
    customer_exports_enabled: false,
    export_submissions_enabled: false,
  });
  if (orgErr) throw new Error(`seed org: ${orgErr.message}`);

  // One strong throwaway password for both QA logins; printed once, never persisted.
  const password = `QA-a63-${randomBytes(12).toString("base64url")}!`;
  for (const u of QA_USERS) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`seed user ${u.email}: ${error?.message}`);
    const { error: pErr } = await db.from("profiles").insert({
      auth_user_id: data.user.id,
      organization_id: QA_ORG_ID,
      name: u.name,
      email: u.email,
      role: u.role,
      status: "active",
    });
    if (pErr) throw new Error(`seed profile ${u.email}: ${pErr.message}`);
  }

  const { error: aErr } = await db.from("assets").insert({
    id: QA_ASSET_ID,
    organization_id: QA_ORG_ID,
    asset_code: "QA-A63-TEST",
    asset_name: "QA Test Trailer (A6.3 — disposable)",
    category: "Utility Trailer",
    public_status: "public",
    return_inspection_template_key: "utility_trailer",
  });
  if (aErr) throw new Error(`seed asset: ${aErr.message}`);

  const { error: pageErr } = await db.from("equipment_pages").insert({
    asset_id: QA_ASSET_ID,
    organization_id: QA_ORG_ID,
    headline: "QA TEST PAGE — not real equipment.",
    quick_start_text: "This is disposable QA content used to exercise the scan page on real devices.",
    safety_notes: "QA test content. Wear a hard hat and hi-vis. Keep bystanders clear.",
    fuel_power_notes: "QA test content. Diesel only; do not run below a quarter tank.",
    return_notes: "QA test content. Return with a full tank and the deck swept.",
    troubleshooting_notes: "QA test content. If it will not start, check the battery isolator.",
    emergency_notes: "QA test content. In an emergency call the number on the tag.",
    is_published: true,
  });
  if (pageErr) throw new Error(`seed equipment_page: ${pageErr.message}`);

  const { error: qrErr } = await db.from("qr_links").insert({
    organization_id: QA_ORG_ID,
    asset_id: QA_ASSET_ID,
    short_code: QA_SHORT_CODE,
    // Placeholder only — the app always computes the live URL from NEXT_PUBLIC_SITE_URL + short_code.
    public_url: `https://qa.invalid/t/${QA_SHORT_CODE}`,
    status: "active",
  });
  if (qrErr) throw new Error(`seed qr_link: ${qrErr.message}`);

  // An active rental session so the acknowledgement prompt and the staff return path are reachable.
  const { error: sErr } = await db.from("asset_rental_sessions").insert({
    id: QA_SESSION_ID,
    organization_id: QA_ORG_ID,
    asset_id: QA_ASSET_ID,
    status: "active",
    renter_label: "QA Renter (test)",
    rental_reference: "QA-A63",
  });
  if (sErr) throw new Error(`seed rental session: ${sErr.message}`);
  const { error: ptrErr } = await db
    .from("assets")
    .update({ active_rental_session_id: QA_SESSION_ID })
    .eq("id", QA_ASSET_ID);
  if (ptrErr) throw new Error(`seed session pointer: ${ptrErr.message}`);

  console.log("[qa-data] seeded:");
  console.log(`  org        ${QA_ORG_ID}  "${QA_ORG_NAME}"`);
  console.log(`  asset      QA-A63-TEST`);
  console.log(`  short code ${QA_SHORT_CODE}   → /t/${QA_SHORT_CODE}`);
  console.log(`  session    active (acknowledgement + staff return reachable)`);
  for (const u of QA_USERS) console.log(`  login      ${u.email}  (${u.role})`);
  console.log("");
  console.log(`  QA PASSWORD (shown once, not stored anywhere): ${password}`);
  console.log("");
  console.log("  Run `node scripts/qa/staging-qa-data.mjs cleanup` when QA is finished.");
}

async function report(db) {
  const { data: org } = await db
    .from("organizations")
    .select("id,name,slug,status")
    .eq("id", QA_ORG_ID)
    .maybeSingle();
  if (!org) {
    console.log("[qa-data] no QA org present (clean).");
    return;
  }
  console.log(`[qa-data] QA org present: "${org.name}" (${org.status})`);
  for (const table of ["assets", "qr_links", "form_submissions", "asset_rental_sessions", "asset_acknowledgements", "scan_events"]) {
    const { count } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", QA_ORG_ID);
    console.log(`  ${table.padEnd(24)} ${count ?? 0}`);
  }
}

const cmd = process.argv[2];
const db = client();
try {
  if (cmd === "seed") await seed(db);
  else if (cmd === "cleanup") await cleanup(db);
  else if (cmd === "report") await report(db);
  else {
    console.error("usage: staging-qa-data.mjs <seed|report|cleanup>");
    process.exit(1);
  }
} catch (err) {
  console.error(`[qa-data] ${err.message}`);
  process.exit(1);
}
