#!/usr/bin/env node
/**
 * Phase C8 — does the interface acknowledge the user, and how quickly?
 *
 * C0 §11 left this unmeasured ("'feels inert' cannot currently be confirmed or denied"). This answers
 * the four questions C8 actually turns on, so loading UI is added where a wait exists rather than
 * wherever a skeleton would be easy to write.
 *
 *   1. SOFT NAVIGATION — click a dashboard nav link: when does the skeleton appear, when does content?
 *   2. HARD LOAD — open a dashboard route cold. The authenticated layout awaits `requireActiveOrg()`
 *      before any child route's loading UI can render, so this measures whether that auth work
 *      *actually* delays the skeleton. This is the question Part B says to verify rather than assume.
 *   3. PUBLIC FORM — `/forms/<code>/damage` has no loading file. Is one warranted, or is it instant?
 *   4. ACTION ACKNOWLEDGEMENT — click → the button visibly changes. Part E's budget is under 100 ms.
 *
 * Skeletons are detected by `.animate-pulse`, which every existing loading.tsx uses; content by a
 * heading that only the real page renders. A run that never sees content is reported as a FAILURE, not
 * as a fast one — the same rule the C6 action harness follows.
 *
 * READ-ONLY apart from the action probe, which performs ONE reversible status change on a submission it
 * creates itself and then removes.
 *
 * Usage: npm run perf:feedback:staging
 */
import { randomUUID } from "node:crypto";

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";
import { assertSmokeTarget } from "../lib/smoke-target.mjs";

const BASE = (process.env.QA_BASE_URL || process.env.STAGING_BASE_URL || "").replace(/\/$/, "");
const PASSWORD = process.env.STAGING_QA_PASSWORD || "";
const ADMIN = "qa.admin@mulemark-staging.invalid";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const stagingRef = process.env.STAGING_SUPABASE_REF ?? "";
const QA_ORG_ID = "5ac00000-0000-4000-8000-00000057a610";

function refuse(message) {
  console.error(`\n[perceived] REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(1);
}

if (!BASE) refuse("QA_BASE_URL (or STAGING_BASE_URL) is not set.");
if (!PASSWORD) refuse("STAGING_QA_PASSWORD is not set (never printed).");
if (!supabaseUrl || !serviceRoleKey) refuse("Staging Supabase credentials are not set (never printed).");

let target;
let site;
try {
  target = assertTarget("staging", { supabaseUrl, expectedStagingRef: stagingRef || null });
  site = assertSmokeTarget("staging", BASE);
} catch (err) {
  refuse(err.message);
}

console.log(`\n[perceived] STAGING (db: ${target.host}, site: ${site.host})\n`);

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const probe = { assetId: randomUUID(), submissionId: randomUUID() };
const rows = [];
const record = (what, note) => {
  rows.push({ what, note });
  console.log(`  ${what.padEnd(48)} ${note}`);
};

const SKELETON = ".animate-pulse";

/** Wait for a selector and return ms since `from`, or null if it never appeared. */
async function msUntil(page, selector, from, timeout = 20_000) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout });
    return Date.now() - from;
  } catch {
    return null;
  }
}

async function seedProbe() {
  const { error: aErr } = await db.from("assets").insert({
    id: probe.assetId,
    organization_id: QA_ORG_ID,
    asset_code: "C8-FEEDBACK",
    asset_name: "C8 feedback probe",
    category: "Utility Trailer",
    public_status: "public",
    return_inspection_template_key: "utility_trailer",
  });
  if (aErr) throw new Error(`probe asset: ${aErr.message}`);
  await db.from("equipment_pages").insert({
    asset_id: probe.assetId,
    organization_id: QA_ORG_ID,
    headline: "C8 feedback probe",
    is_published: true,
  });
  const shortCode = `c8-fb-${randomUUID().slice(0, 8)}`;
  await db.from("qr_links").insert({
    organization_id: QA_ORG_ID,
    asset_id: probe.assetId,
    short_code: shortCode,
    public_url: `${BASE}/t/${shortCode}`,
    status: "active",
  });
  await db.from("form_submissions").insert({
    id: probe.submissionId,
    organization_id: QA_ORG_ID,
    asset_id: probe.assetId,
    form_type: "damage_report",
    status: "new",
    submitted_by_name: "C8 probe",
    submission_data_json: { description: "C8 perceived-feedback probe" },
  });
  return shortCode;
}

async function cleanup() {
  const { error } = await db.from("assets").delete().eq("id", probe.assetId);
  if (error) console.error(`\n[perceived] cleanup FAILED for asset ${probe.assetId}: ${error.message}\n`);
  else console.log(`\n[perceived] cleaned up the probe asset ${probe.assetId}.`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {},
});

try {
  const shortCode = await seedProbe();
  const page = await context.newPage();

  // ---- Sign in, and time it: login is the one action with no pending state today ----
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill(ADMIN);
  await page.getByLabel(/password/i).fill(PASSWORD);
  const loginAt = Date.now();
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  // Phase C8 added the pending state. What matters is not how long sign-in takes but how long the user
  // stares at an unchanged screen — measure the acknowledgement separately from the completion.
  let loginAck = null;
  try {
    await page.getByRole("button", { name: /Signing in…|Sending link…/ }).waitFor({ state: "visible", timeout: 5_000 });
    loginAck = Date.now() - loginAt;
  } catch {
    loginAck = null; // either no pending state, or the redirect beat it
  }
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  record("login: click → acknowledgement", loginAck === null ? "none observed" : `${loginAck} ms`);
  record("login: click → dashboard", `${Date.now() - loginAt} ms`);

  // ---- 2. HARD LOAD: does the layout's auth work delay the skeleton? ----
  const cold = await context.newPage();
  const coldAt = Date.now();
  await cold.goto(`${BASE}/dashboard/assets`, { waitUntil: "commit" });
  const coldSkeleton = await msUntil(cold, SKELETON, coldAt, 10_000);
  const coldContent = await msUntil(cold, 'h1:has-text("Assets")', coldAt, 30_000);
  record(
    "hard load /dashboard/assets: skeleton",
    coldSkeleton === null ? "NEVER APPEARED" : `${coldSkeleton} ms`
  );
  record("hard load /dashboard/assets: content", coldContent === null ? "FAILED" : `${coldContent} ms`);
  record(
    "→ Part B verdict",
    coldSkeleton === null
      ? "layout auth BLOCKS the loading file on a cold load — content arrives with no skeleton first"
      : `skeleton led content by ${coldContent - coldSkeleton} ms`
  );
  await cold.close();

  // ---- 1. SOFT NAVIGATION between dashboard routes ----
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const navAt = Date.now();
  await page.getByRole("link", { name: /^Assets/ }).first().click();
  const softSkeleton = await msUntil(page, SKELETON, navAt, 10_000);
  const softContent = await msUntil(page, 'h1:has-text("Assets")', navAt, 30_000);
  record("soft nav → Assets: skeleton", softSkeleton === null ? "never appeared" : `${softSkeleton} ms`);
  record("soft nav → Assets: content", softContent === null ? "FAILED" : `${softContent} ms`);

  // ---- 3. PUBLIC FORM: is a loading file warranted? ----
  const pub = await context.newPage();
  const pubAt = Date.now();
  await pub.goto(`${BASE}/forms/${shortCode}/damage`, { waitUntil: "commit" });
  const pubContent = await msUntil(pub, "form", pubAt, 30_000);
  record("public damage form: interactive content", pubContent === null ? "FAILED" : `${pubContent} ms`);
  await pub.close();

  // ---- 4. ACTION ACKNOWLEDGEMENT on the status buttons ----
  await page.goto(`${BASE}/dashboard/submissions/${probe.submissionId}`, { waitUntil: "networkidle" });
  const resolve = page.getByRole("button", { name: /^Resolve$/ }).first();
  if (await resolve.isVisible().catch(() => false)) {
    const clickAt = Date.now();
    await resolve.click();
    // "Acknowledged" = the button becomes disabled, which is all it does today.
    let ackMs = null;
    try {
      await page.locator("button:disabled").first().waitFor({ state: "visible", timeout: 5_000 });
      ackMs = Date.now() - clickAt;
    } catch {
      ackMs = null;
    }
    record("status action: click → visible acknowledgement", ackMs === null ? "NONE OBSERVED" : `${ackMs} ms`);
  } else {
    record("status action", "Resolve button not found — not measured");
  }

  await page.close();
} catch (err) {
  console.error(`\n[perceived] run failed: ${String(err?.message ?? err).split("\n")[0]}`);
} finally {
  await context.close();
  await browser.close();
  await cleanup();
}

console.log("");
