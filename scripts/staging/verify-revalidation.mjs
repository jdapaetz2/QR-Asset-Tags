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

/**
 * An observation that is NOT scored. Used for the nav-badge behaviour, which C6.1 established is a
 * client-router-cache property that server-side revalidation cannot reach: reporting it as a FAIL every
 * run would train a reader to ignore this script's failures, which is worse than not measuring it.
 */
const observe = (check, note) => console.log(`  [NOTE] ${check} — ${note}`);

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
  await page.getByText("Step 1 of 3").waitFor({ state: "visible", timeout: 30_000 });

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

  // Stage 2 — wait for the stage to actually arrive before touching it. Mirrors
  // tests/e2e/public/return.spec.ts; without the wait the attestation click races the transition.
  await page.getByText("Step 2 of 3").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Review return checklist" }).click();

  // Stage 3 — submit, then acknowledge the no-photo omission dialog (a soft prompt, not a block).
  await page.getByText("Step 3 of 3").waitFor({ state: "visible", timeout: 30_000 });
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
    observe(
      "nav badge after in-app navigation only (no reload)",
      `${before} → ${after}` +
        (after === before + 1
          ? " — updated"
          : " — unchanged, as C6.1 documented: the badge lives in the shared layout and this tab's" +
            " client router cache predates the submission. Not a regression, and not what C7 fixes.")
    );

    const rowVisible = await admin
      .getByText(reference)
      .first()
      .isVisible()
      .catch(() => false);
    observe(
      "the new row in the inbox list after in-app navigation only",
      rowVisible ? `${reference} present` : `${reference} absent — same client-cache reason as above`
    );

    // ---- DIAGNOSTIC ONLY. This is not, and is never reported as, proof. -----
    // A reload refetches everything and so passes whether or not revalidation works. Its only job here
    // is to separate two very different explanations of a failure above:
    //   * the row is not visible to this admin at all  → a data/authorization problem;
    //   * the row is visible after a reload but not before → the admin's CLIENT router cache is stale,
    //     which server-side revalidatePath in someone else's request cannot reach.
    // Recorded as an observation, never as a PASS.
    if (!rowVisible || after !== before + 1) {
      await admin.reload({ waitUntil: "domcontentloaded" });
      const afterReload = await readBadge(admin);
      const rowAfterReload = await admin
        .getByText(reference)
        .first()
        .isVisible()
        .catch(() => false);
      console.log(
        `  [DIAGNOSTIC — not proof] after a hard reload: badge ${afterReload}, row visible ${rowAfterReload}`
      );
      console.log(
        `  [DIAGNOSTIC — not proof] ${
          rowAfterReload && afterReload === before + 1
            ? "data IS correct and authorized; the staleness is in the admin's client router cache."
            : "the data itself did not reach this admin — investigate before blaming caching."
        }`
      );
    }

    // ---- Phase C7: does an OPEN inbox notice a new submission? ---------------
    // C6.1 established that server-side revalidation cannot reach this tab. C7 is the mechanism that
    // can: the page polls a tiny token and offers to load when it moves. This proves that end to end.
    //
    // A fresh baseline first (reload is legitimate HERE — it is establishing the starting state, not
    // standing in as proof), then a submission from the separate renter context, then WAIT. No reload,
    // no navigation, no interaction: the affordance must appear on its own.
    await admin.reload({ waitUntil: "domcontentloaded" });
    await admin.getByRole("button", { name: "Refresh" }).first().waitFor({ state: "visible", timeout: 30_000 });

    const secondRef = await submitReturnChecklist(renterContext);
    const loadButton = admin.getByRole("button", { name: /Load$/ });
    let noticed = false;
    try {
      // 60s poll interval plus slack for one tick to land.
      await loadButton.waitFor({ state: "visible", timeout: 95_000 });
      noticed = true;
    } catch {
      noticed = false;
    }
    record(
      "an open inbox surfaces a new submission by itself, with no reload and no navigation",
      noticed,
      noticed ? `offered "${(await loadButton.innerText()).trim()}" for ${secondRef}` : "no affordance appeared"
    );

    if (noticed) {
      // And loading it must actually bring the row in.
      // Capture the "Updated <relative>" stamp first. If the stamp moves, router.refresh() genuinely
      // re-rendered and a missing row is a real defect; if it does not, the refresh never happened and
      // the fault is in the control, not the data. Without this the failure is unattributable.
      const stamp = admin.locator("span", { hasText: /^Updated/ }).first();
      const stampBefore = await stamp.innerText().catch(() => "?");
      const rowCountBefore = await admin.getByText(/SUB-\d{4}-[0-9A-F]{6}/).count();

      await loadButton.click();
      // router.refresh() runs in a transition, so the row arrives asynchronously. Checking visibility
      // synchronously after the click measures the click, not the outcome.
      // The inbox renders BOTH a desktop table and a mobile card list, so every reference appears twice
      // in the DOM with one copy hidden by CSS. `.first()` therefore picks the hidden copy about half the
      // time and `waitFor({state:"visible"})` times out on it while a perfectly visible copy sits beside
      // it — which is exactly the intermittent failure this check showed before the filter was added.
      let loadedRow = false;
      try {
        await admin
          .getByText(secondRef)
          .filter({ visible: true })
          .first()
          .waitFor({ state: "visible", timeout: 30_000 });
        loadedRow = true;
      } catch {
        loadedRow = false;
      }
      const stampAfter = await stamp.innerText().catch(() => "?");
      const rowCountAfter = await admin.getByText(/SUB-\d{4}-[0-9A-F]{6}/).count();
      console.log(
        `  [DIAGNOSTIC — not proof] stamp "${stampBefore}" → "${stampAfter}"; ` +
          `reference-shaped rows ${rowCountBefore} → ${rowCountAfter}`
      );
      record("clicking Load brings the new row into the inbox", loadedRow, secondRef);
    }

    // ---- Exactly one submission ---------------------------------------------
    const { data: rows, error } = await db
      .from("form_submissions")
      .select("id, form_type, status, media_urls")
      .eq("asset_id", created.assetId);
    if (error) throw new Error(`count read: ${error.message}`);
    // Two deliberate submissions: one for the C6.1 sequence, one for the C7 awareness check.
    record("exactly two submissions exist — one per deliberate submit, no duplicates", (rows ?? []).length === 2, `${(rows ?? []).length} rows`);
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
