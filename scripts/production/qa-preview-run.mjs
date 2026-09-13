#!/usr/bin/env node
/**
 * Engineering Phase D4 — Production live QA for inline photo previews. OPERATOR-APPROVED in the D4 plan.
 *
 * WHAT IT DOES. Submits a fixed set of public damage and return reports on the Production QA tag with GENERATED,
 * clearly labelled photos (one carries GPS EXIF, one an EXIF rotation tag, some are deliberately corrupt), changing
 * the QA organization's notification settings between scenarios so each exercises one D4 behaviour. It prints each
 * scenario's reference and submit→confirmation time, plus the UTC window to read in the Vercel runtime logs. The
 * emails land in the approved QA inboxes for a human to inspect.
 *
 * REFUSALS, because this writes to PRODUCTION:
 *   1. `assertTarget("production", …)` — the credentials must be the production project; staging is refused by name.
 *   2. The organization, asset and short code are hard-coded QA fixtures (docs/PHASE_C_BASELINE.md §15). There is
 *      no argument through which a customer organization or tag could be named.
 *   3. Recipients are an ALLOWLIST of two: our own support mailbox and Resend's sandbox. A customer address cannot be
 *      set, and an existing address this tool did not set is never overwritten.
 *   4. Without `--confirm` it prints the plan and writes nothing.
 *
 * RESTORE. Every notification column of the QA organization is read first and written back in a `finally`, whatever
 * happens. The QA submissions it creates are test data on the QA organization and are kept, like every other QA run.
 *
 * NO SECRETS are printed: no key, no address beyond the two allowlisted constants, no storage path.
 *
 * Shared fixtures, guards and form drivers live in ./lib/qa-forms.mjs (Engineering Phase D5).
 *
 * Usage:
 *   npm run production:qa-previews                 # dry run: prints the scenarios
 *   npm run production:qa-previews -- --confirm    # submits them
 *   npm run production:qa-previews -- --confirm --only=damage-one,previews-off
 */
import { chromium } from "playwright";

import {
  GPS_EXIF,
  INTERVAL_MS,
  QA_ORG_ID,
  QA_SHORT_CODE,
  SANDBOX_RECIPIENT,
  SUPPORT_RECIPIENT,
  applySettings,
  assertAllowlisted,
  awaitConfirmation,
  connectProduction,
  corruptJpeg,
  errorLine,
  labelledPhoto,
  readQaSettings,
  refuse,
  restoreSettings,
  sleep,
  submitDamage,
  submitReturn,
} from "./lib/qa-forms.mjs";

const TAG = "qa-previews";
const BANNER = "MULEMARK D4 QA";

const args = process.argv.slice(2);
const CONFIRMED = args.includes("--confirm");
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").slice("--only=".length).split(",").filter(Boolean);

const photo = (options) => labelledPhoto({ banner: BANNER, ...options });

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const BASE_SETTINGS = {
  notification_email: SUPPORT_RECIPIENT,
  notify_damage_reports: true,
  notify_support_requests: true,
  notify_urgent_reports: false,
  urgent_notification_email: null,
  return_notification_mode: "instant_renter",
  notify_include_photo_previews: true,
};

const SCENARIOS = [
  {
    id: "damage-one",
    expect: "1 inline preview (landscape), preview line 1 of 1",
    form: "damage",
    files: async () => [await photo({ label: "One photo landscape", hue: 20 })],
  },
  {
    id: "damage-five",
    expect: "3 previews = first three uploads: GPS photo (no metadata), portrait shown upright, PNG; 3 of 5",
    form: "damage",
    // Five files must fit Vercel's 4.5 MB function request body together (see the D4 QA notes), so these are
    // smaller than the single-photo scenarios.
    files: async () => [
      await photo({ label: "1 GPS EXIF", hue: 60, exif: GPS_EXIF, width: 1600, height: 1066 }),
      await photo({ label: "2 rotated portrait", hue: 100, orientation: 6, width: 1600, height: 1066 }),
      await photo({ label: "3 PNG", hue: 140, format: "png", width: 700, height: 525 }),
      await photo({ label: "4 WebP", hue: 180, format: "webp", width: 1200, height: 800 }),
      await photo({ label: "5 not previewed", hue: 220, width: 1200, height: 800 }),
    ],
  },
  {
    id: "damage-partial",
    expect: "2 previews (corrupt first file omitted), 2 of 3; log previewFailureClass decode_failed",
    form: "damage",
    files: async () => [
      await corruptJpeg("corrupt-first.jpg"),
      await photo({ label: "Partial good A", hue: 30 }),
      await photo({ label: "Partial good B", hue: 90 }),
    ],
  },
  {
    id: "damage-all-corrupt",
    expect: "text-only: 'Photo previews: none included.'; no images; still delivered",
    form: "damage",
    files: async () => [await corruptJpeg("corrupt-a.jpg"), await corruptJpeg("corrupt-b.jpg")],
  },
  {
    id: "previews-off",
    expect: "text-only with no preview line (organization switch off)",
    form: "damage",
    settings: { notify_include_photo_previews: false },
    files: async () => [await photo({ label: "Switch off", hue: 250 })],
  },
  {
    id: "urgent-same-address",
    expect: "Immediate attention; ONE email (main_and_urgent) with 1 preview",
    form: "damage",
    unsafe: true,
    settings: { notify_urgent_reports: true, urgent_notification_email: SUPPORT_RECIPIENT },
    files: async () => [await photo({ label: "Urgent same address", hue: 0 })],
  },
  {
    id: "urgent-different-address",
    expect: "Immediate attention; TWO sends (main support inbox + urgent Resend sandbox), identical previews",
    form: "damage",
    unsafe: true,
    settings: { notify_urgent_reports: true, urgent_notification_email: SANDBOX_RECIPIENT },
    files: async () => [await photo({ label: "Urgent two routes", hue: 40 })],
  },
  {
    id: "return-damage",
    expect: "Follow up renter return; damage-slot photo previewed first, then the other slot",
    form: "return",
    damage: true,
    photos: async () => ({
      damage: [await photo({ label: "Return damage slot", hue: 10, exif: GPS_EXIF })],
      other: [await photo({ label: "Return other slot", hue: 200 })],
    }),
  },
  {
    id: "return-clean",
    expect: "record-only renter return; photo count only, NO preview",
    form: "return",
    damage: false,
    photos: async () => ({ damage: [], other: [await photo({ label: "Clean return", hue: 120 })] }),
  },
];

const selected = ONLY.length > 0 ? SCENARIOS.filter((s) => ONLY.includes(s.id)) : SCENARIOS;
if (selected.length === 0) refuse(TAG, `--only matched no scenario. Known: ${SCENARIOS.map((s) => s.id).join(", ")}`);

// ---------------------------------------------------------------------------
// Target and settings
// ---------------------------------------------------------------------------

const { db, host } = connectProduction(TAG);

console.log(`\n[${TAG}] target verified: PRODUCTION (host: ${host}), QA organization ${QA_ORG_ID}, tag ${QA_SHORT_CODE}`);
for (const s of selected) console.log(`  - ${s.id}: ${s.expect}`);

if (!CONFIRMED) {
  console.log("\n  DRY RUN — nothing written or submitted. Pass --confirm to run.\n");
  process.exit(0);
}

let original;
try {
  original = await readQaSettings(db);
  assertAllowlisted(original, "the QA organization");
} catch (err) {
  refuse(TAG, err.message);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const results = [];
const startedAt = new Date();
const browser = await chromium.launch();

try {
  for (const [index, scenario] of selected.entries()) {
    if (index > 0) await sleep(INTERVAL_MS);
    const row = { id: scenario.id, expect: scenario.expect, reference: null, confirmMs: null, status: "failed", note: "" };
    results.push(row);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await applySettings(db, { ...BASE_SETTINGS, ...(scenario.settings ?? {}) });
      let clickedAt;
      if (scenario.form === "damage") {
        clickedAt = await submitDamage(page, {
          name: "D4 Preview QA",
          email: "d4-preview-qa@example.test",
          triage: scenario.unsafe ? { state: "It's not safe to use", need: "I need help now" } : {},
          description: `D4 preview QA (${scenario.id}). Automated test data, not a customer report.`,
          files: await scenario.files(),
        });
      } else {
        const outcome = await submitReturn(page, { id: scenario.id, damage: scenario.damage, photos: await scenario.photos() });
        if (outcome.notRun) {
          row.status = "not run";
          row.note = outcome.notRun;
          continue;
        }
        clickedAt = outcome.clickedAt;
      }
      Object.assign(row, await awaitConfirmation(page, clickedAt));
    } catch (err) {
      row.note = errorLine(err);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  // Give the last deferred notification time to read the settings it was submitted under, then restore.
  await sleep(20_000);
  const restored = await restoreSettings(db, original);
  console.log(`\n[${TAG}] QA organization settings restored: ${restored ? "yes (verified)" : "NO — restore by hand"}`);
}

const endedAt = new Date();
console.log(`\n[${TAG}] Vercel log window (UTC): ${startedAt.toISOString()} → ${endedAt.toISOString()}\n`);
console.log("| Scenario | Status | Reference | Submit→confirm | Expected | Note |");
console.log("|---|---|---|---|---|---|");
for (const r of results) {
  console.log(`| ${r.id} | ${r.status} | ${r.reference ?? "—"} | ${r.confirmMs === null ? "—" : `${r.confirmMs} ms`} | ${r.expect} | ${r.note} |`);
}
const failed = results.filter((r) => r.status === "failed" || r.status === "rate limited").length;
process.exit(failed > 0 ? 1 : 0);
