#!/usr/bin/env node
/**
 * Phase C6.1 — runtime proof that a guided return checklist refreshes the admin's submission surfaces.
 *
 * WHY A RUNTIME CHECK AT ALL. The unit tests prove `revalidateSubmissionSurfaces()` is called on the
 * committed path. They cannot prove the call actually busts the shared layout segment in a real Next.js
 * runtime, which is the thing an operator cares about: the nav badge changing without anyone reloading.
 *
 * **A BROWSER RELOAD IS NOT ACCEPTED AS PROOF, and that is the entire point of this script.** A hard
 * refetches everything and therefore passes whether or not revalidation works — which is exactly how the
 * missing call went unnoticed. So the admin here navigates only by CLICKING IN-APP LINKS, the soft
 * client-side navigation a real admin performs. If revalidation is broken, the badge keeps its stale
 * value and this fails.
 *
 * Fail-closed on two axes (`assertTarget` on the credentials, `assertSmokeTarget` on the URL). Creates
 * one disposable asset + QR under its own organization and removes exactly what it created. No secret is
 * printed, and no existing staging tenant is read or touched.
 *
 * Usage: npm run staging:verify-revalidation -- --confirm
 */
import { randomUUID } from "node:crypto";

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";
import { assertSmokeTarget } from "../lib/smoke-target.mjs";

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");

function fail(message, hints = []) {
  console.error(`\n[verify-revalidation] ${message}`);
  for (const h of hints) console.error(`  ${h}`);
  console.error("");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const stagingRef = process.env.STAGING_SUPABASE_REF ?? "";
const base = (process.env.QA_BASE_URL || process.env.STAGING_BASE_URL || "").replace(/\/$/, "");
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const adminEmail = "qa.admin@mulemark-staging.invalid";
const password = process.env.STAGING_QA_PASSWORD || "";

if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set (never printed).");
if (!base) fail("QA_BASE_URL (or STAGING_BASE_URL) is not set.");
if (!password) fail("STAGING_QA_PASSWORD is not set (never printed).");

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

console.log(`\n[verify-revalidation] target verified: STAGING (db: ${target.host}, site: ${site.host})`);
console.log("[verify-revalidation] plan: create a disposable asset + QR in the QA org, read the admin badge,");
console.log("  submit one guided return checklist from a separate anonymous context, navigate by CLICKING");
console.log("  (never reloading), and require the badge and inbox to reflect the new row.\n");

if (!confirmed) {
  console.log("  DRY RUN — nothing created, nothing submitted. Pass --confirm to run.\n");
  process.exit(0);
}

/** The staging QA organization the admin account belongs to (scripts/staging/seed-staging-qa.mjs). */
const QA_ORG_ID = "5ac00000-0000-4000-8000-00000057a610";

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const created = { assetId: randomUUID(), shortCode: `c61-rev-${randomUUID().slice(0, 8)}` };

const results = [];
const record = (check, ok, note = "") => {
  results.push({ check, ok, note });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${check}${note ? ` — ${note}` : ""}`);
};

/** Read the numeric badge on the Submissions nav link; absent badge means zero. */
async function readBadge(page) {
  const link = page.getByRole("link", { name: /^Submissions/ }).first();
  await link.waitFor({ state: "visible", timeout: 15_000 });
  const text = (await link.innerText()).trim();
  const m = text.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

async function setup() {
  // The admin fixture belongs to the QA org, so the probe asset must too for the badge to move.
  const { error: aErr } = await db.from("assets").insert({
    id: created.assetId,
    organization_id: QA_ORG_ID,
    asset_code: "C61-REV",
    asset_name: "C6.1 revalidation probe",
    category: "Utility Trailer",
    public_status: "public",
    return_inspection_template_key: "utility_trailer",
  });
  if (aErr) throw new Error(`probe asset: ${aErr.message}`);

  const { error: pErr } = await db.from("equipment_pages").insert({
    asset_id: created.assetId,
    organization_id: QA_ORG_ID,
    headline: "C6.1 revalidation probe",
    is_published: true,
  });
  if (pErr) throw new Error(`probe page: ${pErr.message}`);

  const { error: qErr } = await db.from("qr_links").insert({
    organization_id: QA_ORG_ID,
    asset_id: created.assetId,
    short_code: created.shortCode,
    public_url: `${base}/t/${created.shortCode}`,
    status: "active",
  });
  if (qErr) throw new Error(`probe qr: ${qErr.message}`);
}

async function cleanup() {
  // Only the asset this run generated. Submissions, pages and QR links cascade from it.
  if (!created.assetId) return;
  const { error } = await db.from("assets").delete().eq("id", created.assetId);
  if (error) {
    console.error(`\n[verify-revalidation] cleanup FAILED for asset ${created.assetId}: ${error.message}`);
    console.error("  Remove it manually — nothing else was created by this run.\n");
    return;
  }
  console.log(`\n[verify-revalidation] cleaned up the disposable asset ${created.assetId}.`);
}

async function submitReturnChecklist(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/forms/${created.shortCode}/return`, { waitUntil: "domcontentloaded" });

  // Stage 1 — answer every visible condition group; explicitly "No" for damage so no photo is required.
  const groups = page.locator('fieldset[id^="field-"]:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const group = groups.nth(i);
    const id = (await group.getAttribute("id")) ?? "";
    if (/damage/.test(id)) await group.getByText("No", { exact: true }).click();
    else await group.locator("label").first().click();
  }
  await page.getByRole("button", { name: "Continue" }).click();

  // Stage 2 — the required attestation.
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review return checklist" }).click();

  // Stage 3 — submit, then acknowledge the no-photo omission dialog (a soft prompt, not a block).
  await page.getByRole("button", { name: "Submit return checklist" }).click();
  const dialog = page.locator("dialog[open]");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Submit without photos" }).click();
  }

  await page.waitForURL(/\/return\/thanks/, { timeout: 60_000 });
  const ref = (await page.getByText(/SUB-\d{4}-[0-9A-F]{6}/).first().innerText()).trim();
  await page.close();
  return ref.match(/SUB-\d{4}-[0-9A-F]{6}/)?.[0] ?? null;
}

async function run() {
  await setup();

  const browser = await chromium.launch();
  const headers = bypass ? { "x-vercel-protection-bypass": bypass } : {};
  const adminContext = await browser.newContext({ extraHTTPHeaders: headers });
  const renterContext = await browser.newContext({ extraHTTPHeaders: headers });

  try {
    // ---- Admin signs in and records the starting badge -----------------------
    const admin = await adminContext.newPage();
    await admin.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await admin.getByLabel(/email/i).fill(adminEmail);
    await admin.getByLabel(/password/i).fill(password);
    await admin.getByRole("button", { name: /sign in|log in/i }).click();
    await admin.waitForURL(/\/dashboard/, { timeout: 60_000 });

    const before = await readBadge(admin);
    console.log(`\n  starting new-submission badge: ${before}\n`);

    // ---- A renter submits a guided return checklist, in a separate context ---
    const reference = await submitReturnChecklist(renterContext);
    record("renter reached the confirmation page with a canonical reference", Boolean(reference), reference ?? "none");
    if (!reference) throw new Error("no reference — the submission did not complete");

    // ---- The admin navigates by CLICKING. No reload. -------------------------
    // If revalidation is broken, the preserved layout segment keeps serving the stale badge and the
    // assertions below fail. That is the whole test.
    await admin.getByRole("link", { name: /^Assets/ }).first().click();
    await admin.waitForURL(/\/dashboard\/assets/, { timeout: 30_000 });
    await admin.getByRole("link", { name: /^Submissions/ }).first().click();
    await admin.waitForURL(/\/dashboard\/submissions/, { timeout: 30_000 });

    const after = await readBadge(admin);
    record(
      "nav badge reflects the new submission after in-app navigation only (no reload)",
      after === before + 1,
      `${before} → ${after}`
    );

    const rowVisible = await admin
      .getByText(reference)
      .first()
      .isVisible()
      .catch(() => false);
    record("the new row appears in the unresolved inbox", rowVisible, reference);

    // ---- Exactly one submission ---------------------------------------------
    const { data: rows, error } = await db
      .from("form_submissions")
      .select("id, form_type, status, media_urls")
      .eq("asset_id", created.assetId);
    if (error) throw new Error(`count read: ${error.message}`);
    record("exactly one submission exists for the probe asset", (rows ?? []).length === 1, `${(rows ?? []).length} rows`);
    record(
      "it is a new return_checklist",
      rows?.[0]?.form_type === "return_checklist" && rows?.[0]?.status === "new",
      `${rows?.[0]?.form_type ?? "?"} / ${rows?.[0]?.status ?? "?"}`
    );

    await admin.close();
  } finally {
    await adminContext.close();
    await renterContext.close();
    await browser.close();
  }

  return results.every((r) => r.ok);
}

let ok = false;
try {
  ok = await run();
} catch (err) {
  console.error(`\n[verify-revalidation] run failed: ${String(err?.message ?? err).split("\n")[0]}`);
} finally {
  await cleanup();
}

console.log(
  `\n[verify-revalidation] ${ok ? "ALL CHECKS PASSED" : "FAILURES PRESENT — see above"}\n` +
    "  Preview never sends live mail: sendNotificationEmail refuses deploymentContext()==='preview'\n" +
    "  before reading any credential (lib/notifications/send.ts), covered by lib/notifications/send.test.ts.\n"
);
process.exit(ok ? 0 : 1);
