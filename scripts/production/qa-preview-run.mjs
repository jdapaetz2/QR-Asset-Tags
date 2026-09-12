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
 * RESTORE. The QA organization's notification settings are read first and written back in a `finally`, whatever
 * happens. The QA submissions it creates are test data on the QA organization and are kept, like every other QA run.
 *
 * NO SECRETS are printed: no key, no address beyond the two allowlisted constants, no storage path.
 *
 * Usage:
 *   npm run production:qa-previews                 # dry run: prints the scenarios
 *   npm run production:qa-previews -- --confirm    # submits them
 *   npm run production:qa-previews -- --confirm --only=damage-one,previews-off
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";

import { assertTarget } from "../lib/env-target.mjs";

const QA_ORG_ID = "c0000000-0000-4000-8000-00000000c0a1";
const QA_SHORT_CODE = "prod-qa-perf-probe";
const BASE = "https://mulemark.io";

const SUPPORT_RECIPIENT = "support@mulemark.io";
const SANDBOX_RECIPIENT = "delivered@resend.dev";
const ALLOWED_RECIPIENTS = new Set([SUPPORT_RECIPIENT, SANDBOX_RECIPIENT]);

const SETTINGS_COLUMNS =
  "notification_email, notify_damage_reports, notify_support_requests, notify_urgent_reports, urgent_notification_email, return_notification_mode, notify_include_photo_previews";

/** Public media intake is 3/min and 15/hour per (action, ip, short code). 25 s keeps every burst inside a minute. */
const INTERVAL_MS = 25_000;
const REFERENCE_RE = /SUB-\d{4}-[0-9A-F]{6}/;
const RATE_LIMITED_TEXT = "Too many attempts right now";

const args = process.argv.slice(2);
const CONFIRMED = args.includes("--confirm");
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").slice("--only=".length).split(",").filter(Boolean);

function fail(message) {
  console.error(`\n[qa-previews] REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Generated photos — labelled so a human can match each preview to its scenario.
// ---------------------------------------------------------------------------

function labelSvg(width, height, lines) {
  const size = Math.round(height / 9);
  const text = lines
    .map((line, i) => `<text x="50%" y="${35 + i * 18}%" font-size="${size}" text-anchor="middle" font-family="Arial, sans-serif" fill="#ffffff" stroke="#000000" stroke-width="${Math.max(2, size / 18)}">${line}</text>`)
    .join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text}</svg>`);
}

/** A gradient with mild noise, so the JPEG is photo-sized (~1–2 MB) rather than trivially compressible. */
function photoPixels(width, height, hue) {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = hue * 7919 + 13;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const jitter = (seed & 0x3f) - 32;
      const i = (y * width + x) * 3;
      pixels[i] = Math.max(0, Math.min(255, ((x / width) * 200 + hue) % 256 + jitter));
      pixels[i + 1] = Math.max(0, Math.min(255, (y / height) * 180 + jitter));
      pixels[i + 2] = Math.max(0, Math.min(255, 120 + jitter));
    }
  }
  return pixels;
}

async function labelledPhoto({ label, hue, width = 2400, height = 1600, format = "jpeg", exif = null, orientation = null }) {
  let image = sharp(photoPixels(width, height, hue), { raw: { width, height, channels: 3 } }).composite([
    { input: labelSvg(width, height, ["MULEMARK D4 QA", label]), top: 0, left: 0 },
  ]);
  if (exif) image = image.withExif(exif);
  if (orientation) image = image.withMetadata({ orientation });
  const buffer =
    format === "png" ? await image.png().toBuffer() : format === "webp" ? await image.webp({ quality: 85 }).toBuffer() : await image.jpeg({ quality: 88 }).toBuffer();
  const ext = format === "jpeg" ? "jpg" : format;
  return { name: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${ext}`, mimeType: `image/${format}`, buffer };
}

function corruptJpeg(name) {
  const body = Buffer.alloc(40_000);
  for (let i = 0; i < body.length; i++) body[i] = (i * 31 + 7) & 0xff;
  return { name, mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), body]) };
}

const GPS_EXIF = {
  IFD0: { Make: "MulemarkQA", Model: "D4 GPS fixture", Copyright: "Mulemark QA test data" },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "49/1 15/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "123/1 6/1 0/1" },
};

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
    files: async () => [await labelledPhoto({ label: "One photo landscape", hue: 20 })],
  },
  {
    id: "damage-five",
    expect: "3 previews = first three uploads: GPS photo (no metadata), portrait shown upright, PNG; 3 of 5",
    form: "damage",
    // Five files must fit Vercel's 4.5 MB function request body together (see the D4 QA notes), so these are
    // smaller than the single-photo scenarios.
    files: async () => [
      await labelledPhoto({ label: "1 GPS EXIF", hue: 60, exif: GPS_EXIF, width: 1600, height: 1066 }),
      await labelledPhoto({ label: "2 rotated portrait", hue: 100, orientation: 6, width: 1600, height: 1066 }),
      await labelledPhoto({ label: "3 PNG", hue: 140, format: "png", width: 700, height: 525 }),
      await labelledPhoto({ label: "4 WebP", hue: 180, format: "webp", width: 1200, height: 800 }),
      await labelledPhoto({ label: "5 not previewed", hue: 220, width: 1200, height: 800 }),
    ],
  },
  {
    id: "damage-partial",
    expect: "2 previews (corrupt first file omitted), 2 of 3; log previewFailureClass decode_failed",
    form: "damage",
    files: async () => [
      corruptJpeg("corrupt-first.jpg"),
      await labelledPhoto({ label: "Partial good A", hue: 30 }),
      await labelledPhoto({ label: "Partial good B", hue: 90 }),
    ],
  },
  {
    id: "damage-all-corrupt",
    expect: "text-only: 'Photo previews: none included.'; no images; still delivered",
    form: "damage",
    files: async () => [corruptJpeg("corrupt-a.jpg"), corruptJpeg("corrupt-b.jpg")],
  },
  {
    id: "previews-off",
    expect: "text-only with no preview line (organization switch off)",
    form: "damage",
    settings: { notify_include_photo_previews: false },
    files: async () => [await labelledPhoto({ label: "Switch off", hue: 250 })],
  },
  {
    id: "urgent-same-address",
    expect: "Immediate attention; ONE email (main_and_urgent) with 1 preview",
    form: "damage",
    unsafe: true,
    settings: { notify_urgent_reports: true, urgent_notification_email: SUPPORT_RECIPIENT },
    files: async () => [await labelledPhoto({ label: "Urgent same address", hue: 0 })],
  },
  {
    id: "urgent-different-address",
    expect: "Immediate attention; TWO sends (main support inbox + urgent Resend sandbox), identical previews",
    form: "damage",
    unsafe: true,
    settings: { notify_urgent_reports: true, urgent_notification_email: SANDBOX_RECIPIENT },
    files: async () => [await labelledPhoto({ label: "Urgent two routes", hue: 40 })],
  },
  {
    id: "return-damage",
    expect: "Follow up renter return; damage-slot photo previewed first, then the other slot",
    form: "return",
    damage: true,
    photos: async () => ({
      damage: [await labelledPhoto({ label: "Return damage slot", hue: 10, exif: GPS_EXIF })],
      other: [await labelledPhoto({ label: "Return other slot", hue: 200 })],
    }),
  },
  {
    id: "return-clean",
    expect: "record-only renter return; photo count only, NO preview",
    form: "return",
    damage: false,
    photos: async () => ({ damage: [], other: [await labelledPhoto({ label: "Clean return", hue: 120 })] }),
  },
];

const selected = ONLY.length > 0 ? SCENARIOS.filter((s) => ONLY.includes(s.id)) : SCENARIOS;
if (selected.length === 0) fail(`--only matched no scenario. Known: ${SCENARIOS.map((s) => s.id).join(", ")}`);

// ---------------------------------------------------------------------------
// Target and settings
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set (never printed).");

let target;
try {
  target = assertTarget("production", { supabaseUrl, expectedStagingRef: process.env.STAGING_SUPABASE_REF || null });
} catch (err) {
  fail(err.message);
}

console.log(`\n[qa-previews] target verified: PRODUCTION (host: ${target.host}), QA organization ${QA_ORG_ID}, tag ${QA_SHORT_CODE}`);
for (const s of selected) console.log(`  - ${s.id}: ${s.expect}`);

if (!CONFIRMED) {
  console.log("\n  DRY RUN — nothing written or submitted. Pass --confirm to run.\n");
  process.exit(0);
}

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const { data: original, error: readErr } = await db.from("organizations").select(SETTINGS_COLUMNS).eq("id", QA_ORG_ID).maybeSingle();
if (readErr) fail(`could not read the QA organization: ${readErr.message}`);
if (!original) fail(`the QA organization ${QA_ORG_ID} does not exist on this project.`);
for (const column of ["notification_email", "urgent_notification_email"]) {
  if (original[column] && !ALLOWED_RECIPIENTS.has(original[column])) {
    fail(`the QA organization's ${column} holds an address this tool did not set. Refusing to overwrite it.`);
  }
}

async function applySettings(patch) {
  for (const column of ["notification_email", "urgent_notification_email"]) {
    if (patch[column] && !ALLOWED_RECIPIENTS.has(patch[column])) throw new Error(`refusing a non-allowlisted ${column}`);
  }
  const { error } = await db.from("organizations").update(patch).eq("id", QA_ORG_ID);
  if (error) throw new Error(`settings update failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Form drivers (selectors mirror tests/e2e/support/actions.ts and tests/e2e/public/*.spec.ts)
// ---------------------------------------------------------------------------

async function submitDamage(page, scenario, files) {
  await page.goto(`${BASE}/forms/${QA_SHORT_CODE}/damage`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Your name").fill("D4 Preview QA");
  await page.getByRole("textbox", { name: "Email" }).fill("d4-preview-qa@example.test");
  if (scenario.unsafe) {
    await page.getByRole("group", { name: /Can the equipment be used\?/ }).getByText("It's not safe to use", { exact: true }).click();
    await page.getByRole("group", { name: /How soon do you need help\?/ }).getByText("I need help now", { exact: true }).click();
  }
  await page.getByLabel("What's damaged?").fill(`D4 preview QA (${scenario.id}). Automated test data, not a customer report.`);
  await page.locator('input[name="media"]').setInputFiles(files);
  const clickedAt = Date.now();
  await page.getByRole("button", { name: "Submit damage report" }).click();
  return clickedAt;
}

async function answerConditionStage(page, damage) {
  const groups = page.locator('fieldset[id^="field-"]:visible');
  await groups.first().waitFor({ state: "visible", timeout: 30_000 });
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const group = groups.nth(i);
    const id = (await group.getAttribute("id")) ?? "";
    if (/damage/.test(id)) await group.getByText(damage ? "Yes" : "No", { exact: true }).click();
    else await group.locator("label").first().click();
  }
}

async function submitReturn(page, scenario, photos) {
  await page.goto(`${BASE}/forms/${QA_SHORT_CODE}/return`, { waitUntil: "domcontentloaded" });
  // `isVisible` does not wait; the wizard renders after hydration, so wait for it explicitly.
  const hasChecklist = await page
    .getByText(/Step 1 of 3/)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true, () => false);
  if (!hasChecklist) return { notRun: "the QA tag has no guided return checklist" };

  /** Photo slots render on whichever stage their section lives (and the damage slot only once damage = Yes). */
  const slotNames = () =>
    page.locator('input[type="file"][name^="photo:"]').evaluateAll((els) => els.map((el) => el.getAttribute("name")));
  let damageSet = photos.damage.length === 0;
  let otherSet = photos.other.length === 0;
  const setPhotos = async () => {
    const names = await slotNames();
    if (!damageSet && names.includes("photo:damage_photos")) {
      await page.locator('input[name="photo:damage_photos"]').setInputFiles(photos.damage);
      damageSet = true;
    }
    const otherSlot =
      names.find((name) => name && name !== "photo:damage_photos" && name !== "photo:additional_photos") ??
      names.find((name) => name && name !== "photo:damage_photos");
    if (!otherSet && otherSlot) {
      await page.locator(`input[name="${otherSlot}"]`).setInputFiles(photos.other);
      otherSet = true;
    }
  };

  await answerConditionStage(page, scenario.damage);
  await setPhotos();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText(/Step 2 of 3/).first().waitFor({ timeout: 30_000 });

  if (scenario.damage) {
    await page.locator("#field-damage_location").fill("Left side panel (QA)");
    await page.locator("#field-damage_severity").getByText("Minor", { exact: true }).click();
    await page.locator("#field-damage_description").fill(`D4 preview QA (${scenario.id}). Automated test data.`);
  }
  await setPhotos();
  if (!damageSet) return { notRun: "no damage photo slot appeared on the QA template" };
  if (!otherSet) return { notRun: "no condition photo slot on the QA template" };

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review return checklist" }).click();
  await page.getByText(/Step 3 of 3/).waitFor({ timeout: 30_000 });
  const clickedAt = Date.now();
  await page.getByRole("button", { name: "Submit return checklist" }).click();
  // Recommended photos left empty open one omission dialog; submitting through it is the renter's own choice.
  const dialog = page.locator("dialog[open]");
  if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dialog.getByRole("button", { name: /Submit/ }).first().click();
  }
  return { clickedAt };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
      await applySettings({ ...BASE_SETTINGS, ...(scenario.settings ?? {}) });
      let clickedAt;
      if (scenario.form === "damage") {
        clickedAt = await submitDamage(page, scenario, await scenario.files());
      } else {
        const outcome = await submitReturn(page, scenario, await scenario.photos());
        if (outcome.notRun) {
          row.status = "not run";
          row.note = outcome.notRun;
          continue;
        }
        clickedAt = outcome.clickedAt;
      }
      await Promise.race([
        page.waitForURL(/\/thanks/, { timeout: 90_000 }),
        page.getByText(RATE_LIMITED_TEXT).first().waitFor({ state: "visible", timeout: 90_000 }),
      ]);
      if (await page.getByText(RATE_LIMITED_TEXT).first().isVisible().catch(() => false)) {
        row.status = "rate limited";
        continue;
      }
      const reference = ((await page.getByText(REFERENCE_RE).first().textContent({ timeout: 30_000 })) ?? "").match(REFERENCE_RE);
      row.reference = reference ? reference[0] : null;
      row.confirmMs = Date.now() - clickedAt;
      row.status = row.reference ? "submitted" : "failed";
      if (!row.reference) row.note = "no reference on the confirmation page";
    } catch (err) {
      row.note = String(err?.message ?? err).split("\n")[0].slice(0, 160);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  // Give the last deferred notification time to read the settings it was submitted under, then restore.
  await sleep(20_000);
  const { error } = await db.from("organizations").update(original).eq("id", QA_ORG_ID);
  const { data: after } = await db.from("organizations").select(SETTINGS_COLUMNS).eq("id", QA_ORG_ID).maybeSingle();
  const restored = !error && after && Object.keys(original).every((key) => after[key] === original[key]);
  console.log(`\n[qa-previews] QA organization settings restored: ${restored ? "yes (verified)" : "NO — restore by hand"}`);
}

const endedAt = new Date();
console.log(`\n[qa-previews] Vercel log window (UTC): ${startedAt.toISOString()} → ${endedAt.toISOString()}\n`);
console.log("| Scenario | Status | Reference | Submit→confirm | Expected | Note |");
console.log("|---|---|---|---|---|---|");
for (const r of results) {
  console.log(`| ${r.id} | ${r.status} | ${r.reference ?? "—"} | ${r.confirmMs === null ? "—" : `${r.confirmMs} ms`} | ${r.expect} | ${r.note} |`);
}
const failed = results.filter((r) => r.status === "failed" || r.status === "rate limited").length;
process.exit(failed > 0 ? 1 : 0);
