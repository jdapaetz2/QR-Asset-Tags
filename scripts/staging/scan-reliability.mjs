#!/usr/bin/env node
/**
 * Phase C5 — deferred scan-logging reliability, against STAGING only.
 *
 * C5 moved the `scan_events` insert off the response path into `next/server`'s `after()`. That buys the
 * renter 71-104 ms (C0 §9b) on the route reached from a physical tag, and it is only acceptable if the
 * record still LANDS, lands ONCE, and lands attributed to the right tag. This issues a known number of
 * scans against a QR it creates itself, then verifies exactly that.
 *
 * FAIL-CLOSED ON TWO INDEPENDENT AXES, because one is not enough:
 *   - `assertTarget("staging", …)`     — the CREDENTIALS must belong to the declared staging project;
 *   - `assertSmokeTarget("staging", …)` — the URL being scanned must not be a production origin.
 * Either one refusing stops the run before a single request or write.
 *
 * DISPOSABLE BY CONSTRUCTION. It creates its own organization-scoped asset + QR under ids it generates
 * in this process, and at the end deletes ONLY those ids — it will not delete an id it did not create.
 * No existing staging organization, asset, session or submission is read, modified or removed.
 *
 * No secret is printed. Credentials come from the environment (`--env-file=.env.staging.local`), never
 * from argv, so nothing sensitive can reach a command line, a log or an approval prompt.
 *
 * Usage: npm run staging:scan-reliability -- --confirm [--scans=20]
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";
import { assertSmokeTarget } from "../lib/smoke-target.mjs";

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const SCANS = Math.max(1, Math.min(100, Number((args.find((a) => a.startsWith("--scans=")) ?? "--scans=20").split("=")[1]) || 20));
/** The insert runs after the response, so a row that has not appeared YET is not a row that was lost. */
const APPEARANCE_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

function fail(message, hints = []) {
  console.error(`\n[scan-reliability] ${message}`);
  for (const h of hints) console.error(`  ${h}`);
  console.error("");
  process.exit(1);
}

// ---- Guards -----------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const stagingRef = process.env.STAGING_SUPABASE_REF ?? "";
const base = (process.env.QA_BASE_URL || process.env.STAGING_BASE_URL || "").replace(/\/$/, "");
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set (the staging key; never printed).");
if (!base) fail("QA_BASE_URL (or STAGING_BASE_URL) is not set.");

let target;
try {
  target = assertTarget("staging", { supabaseUrl, expectedStagingRef: stagingRef || null });
} catch (err) {
  fail(err.message, ["See docs/STAGING_ENVIRONMENT_SETUP.md."]);
}

let site;
try {
  site = assertSmokeTarget("staging", base);
} catch (err) {
  fail(err.message);
}

console.log(`\n[scan-reliability] target verified: STAGING (db: ${target.host}, ref: ${target.ref}, site: ${site.host})`);
console.log(`[scan-reliability] plan: create one disposable asset + QR, issue ${SCANS} scans, verify, delete what it created.`);

if (!confirmed) {
  console.log("\n  DRY RUN — nothing created, no scan issued. Pass --confirm to run.\n");
  process.exit(0);
}

// ---- The disposable fixture -------------------------------------------------

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

/** Ids generated HERE. Cleanup will refuse to touch anything not in this set. */
const created = {
  organizationId: randomUUID(),
  assetId: randomUUID(),
  shortCode: `c5-rel-${randomUUID().slice(0, 8)}`,
};

const headers = bypass ? { "x-vercel-protection-bypass": bypass } : {};
const results = [];
const record = (check, ok, note = "") => {
  results.push({ check, ok, note });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${check}${note ? ` — ${note}` : ""}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  // Its own organization, so the probe cannot interact with any existing staging tenant's data.
  const { error: orgErr } = await db.from("organizations").insert({
    id: created.organizationId,
    name: "Mulemark C5 scan-reliability probe — disposable",
    status: "active",
  });
  if (orgErr) fail(`could not create the probe organization: ${orgErr.message}`);

  const { error: assetErr } = await db.from("assets").insert({
    id: created.assetId,
    organization_id: created.organizationId,
    asset_code: "C5-REL",
    asset_name: "C5 scan reliability probe",
    public_status: "public",
  });
  if (assetErr) fail(`could not create the probe asset: ${assetErr.message}`);

  const { error: pageErr } = await db.from("equipment_pages").insert({
    asset_id: created.assetId,
    organization_id: created.organizationId,
    headline: "C5 scan reliability probe",
    is_published: true,
  });
  if (pageErr) fail(`could not publish the probe page: ${pageErr.message}`);

  const { data: qr, error: qrErr } = await db
    .from("qr_links")
    .insert({
      organization_id: created.organizationId,
      asset_id: created.assetId,
      short_code: created.shortCode,
      public_url: `${base}/t/${created.shortCode}`,
      status: "active",
    })
    .select("id")
    .single();
  if (qrErr || !qr?.id) fail(`could not create the probe QR: ${qrErr?.message ?? "no id returned"}`);
  created.qrLinkId = qr.id;
}

async function cleanup() {
  // ONLY the ids generated in this process. A missing id is left alone rather than guessed at.
  if (!created.organizationId) return;
  // scan_events, qr_links, equipment_pages and assets all cascade from the organization row.
  const { error } = await db.from("organizations").delete().eq("id", created.organizationId);
  if (error) {
    console.error(`\n[scan-reliability] cleanup FAILED for organization ${created.organizationId}: ${error.message}`);
    console.error("  Remove it manually — nothing else was created by this run.\n");
    return;
  }
  console.log(`\n[scan-reliability] cleaned up the disposable organization ${created.organizationId}.`);
}

async function run() {
  await setup();

  // ---- Issue the scans ------------------------------------------------------
  const url = `${base}/t/${created.shortCode}`;
  let rendered = 0;
  const startedAt = Date.now();
  for (let i = 0; i < SCANS; i++) {
    const res = await fetch(url, { headers, redirect: "follow" });
    const body = await res.text();
    // A 200 is not enough: the unavailable notice is also a soft 200. Counting those would make the
    // scan total look "lost" when in fact nothing was ever eligible to be recorded.
    if (res.status === 200 && body.includes("C5 scan reliability probe")) rendered++;
  }
  record(`all ${SCANS} scans returned a rendered equipment page`, rendered === SCANS, `${rendered}/${SCANS}`);

  // ---- Wait for the deferred rows ------------------------------------------
  let rows = [];
  let appearedMs = null;
  const deadline = Date.now() + APPEARANCE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data, error } = await db
      .from("scan_events")
      .select("id, qr_link_id, asset_id, organization_id, ip_hash")
      .eq("asset_id", created.assetId);
    if (error) fail(`could not read scan_events: ${error.message}`);
    rows = data ?? [];
    if (rows.length >= SCANS) {
      appearedMs = Date.now() - startedAt;
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  // A short settle so a late duplicate would be caught rather than missed by stopping at exactly N.
  await sleep(2_000);
  const { data: settled } = await db
    .from("scan_events")
    .select("id, qr_link_id, asset_id, organization_id, ip_hash")
    .eq("asset_id", created.assetId);
  rows = settled ?? rows;

  record(
    `exactly ${SCANS} scan events recorded (no loss, no duplicates)`,
    rows.length === SCANS,
    `${rows.length} rows${appearedMs !== null ? `, all present within ${appearedMs} ms of the first scan` : ", TIMED OUT waiting"}`
  );

  const distinctIds = new Set(rows.map((r) => r.id));
  record("every recorded row is distinct", distinctIds.size === rows.length, `${distinctIds.size} unique ids`);

  const attributed = rows.filter(
    (r) =>
      r.asset_id === created.assetId &&
      r.qr_link_id === created.qrLinkId &&
      r.organization_id === created.organizationId
  );
  record("every row is attributed to the probe asset, QR and organization", attributed.length === rows.length, `${attributed.length}/${rows.length}`);

  // Privacy: a salted 32-char digest, or nothing. Never anything that could be an address.
  const badHash = rows.filter((r) => r.ip_hash !== null && !/^[0-9a-f]{32}$/.test(r.ip_hash));
  record("no row stores anything but a hashed IP", badHash.length === 0, `${badHash.length} suspect`);

  return results.every((r) => r.ok);
}

let ok = false;
try {
  console.log(`\n[scan-reliability] running ${SCANS} scans against ${site.host}…\n`);
  ok = await run();
} catch (err) {
  console.error(`\n[scan-reliability] run failed: ${String(err?.message ?? err).split("\n")[0]}`);
} finally {
  await cleanup();
}

console.log(`\n[scan-reliability] ${ok ? "ALL CHECKS PASSED" : "FAILURES PRESENT — see above"}\n`);
process.exit(ok ? 0 : 1);
