#!/usr/bin/env node
/**
 * Direct photo upload verification — photos past Vercel's 4.5 MB request-body limit (migration 0037).
 *
 * WHAT IT DOES, against a deployed app and its own Supabase project:
 *   1. Reads the `submissions` bucket settings (service role, read-only).
 *   2. With --after-0037: tries an anon DIRECT upload into `submissions` under the QA asset and expects it refused.
 *      Should it ever be accepted, the probe object is removed at once and the check fails.
 *   3. Submits a public damage report with five generated photos totalling more than 4.5 MB.
 *   4. Submits a clean public return checklist with generated photos in two photo slots, more than 4.5 MB together.
 *   For 3 and 4 it reads the new row back: the photo count, every stored path under one submission prefix of the QA
 *   asset, and every object present in storage at the size that was sent, with nothing extra.
 *   5. With --samples=<dir> (Engineering Phase D4.1): a damage report with public sample HEIC, AVIF and GIF photos and
 *      a return checklist with HEIC and AVIF photos in two slots. The page converts them on the device; the row must
 *      hold every photo as a JPEG (under 10 MB, under one prefix), and a stored photo must decode as a JPEG with no
 *      EXIF. The samples are the clearly licensed public files listed in docs/STORAGE_MEDIA_LIFECYCLE.md.
 *
 * Staff return and outbound are covered by the local E2E suite: driving them on staging closes the seeded rental
 * session (see scripts/smoke/staging.mjs), and Production has no staff QA fixture.
 *
 * REFUSALS:
 *   - --target is required. The Supabase project must resolve to that target (env-target.mjs) and so must the site
 *     (smoke-target.mjs): staging uses QA_BASE_URL, a Preview host; production is pinned to https://mulemark.io.
 *   - The tag is a hard-coded QA fixture per target. No argument can name a customer tag.
 *   - Without --confirm it prints the plan and writes nothing.
 *
 * WRITES: QA submissions on the QA organization only, kept like every other QA run. Notifications follow that
 * organization's own settings (a Preview never sends live email). NO secret, storage path or signed URL is printed;
 * the bypass secret is sent only to the site origin, never to Supabase.
 *
 * Usage:
 *   node --env-file=.env.staging.local scripts/qa/direct-upload-verify.mjs --target=staging --after-0037 --confirm
 *   node --env-file=.env.local scripts/qa/direct-upload-verify.mjs --target=production --confirm
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";

import { assertTarget } from "../lib/env-target.mjs";
import { CANONICAL_PRODUCTION_ORIGIN, assertSmokeTarget } from "../lib/smoke-target.mjs";
import { bypassHeaders, createRun, visible } from "../smoke/lib/runner.mjs";

const QA_TAGS = { staging: "stg-qa-public", production: "prod-qa-perf-probe" };
/** Vercel refuses Function request bodies over 4.5 MB; stay clearly past it. */
const REQUEST_LIMIT_BYTES = 4.5 * 1024 * 1024;
const EXPECTED_FILE_SIZE_LIMIT = 10 * 1024 * 1024;
const EXPECTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const REFERENCE_RE = /SUB-\d{4}-[0-9A-F]{6}/;
const CONFIRMATION_TIMEOUT_MS = 180_000;

const args = process.argv.slice(2);
const TARGET = (args.find((a) => a.startsWith("--target=")) ?? "").slice("--target=".length);
const CONFIRMED = args.includes("--confirm");
const AFTER_0037 = args.includes("--after-0037");
const SAMPLES = (args.find((a) => a.startsWith("--samples=")) ?? "").slice("--samples=".length);
const SAMPLE_FILES = {
  heic: ["example.heic", "image/heic"],
  avif: ["paris_icc_exif_xmp.avif", "image/avif"],
  grid: ["sofa_grid1x5_420.avif", "image/avif"],
  gif: ["knowledge-animated-transparent.gif", "image/gif"],
};
if (SAMPLES) {
  const missing = Object.values(SAMPLE_FILES).filter(([name]) => !existsSync(join(SAMPLES, name)));
  if (missing.length > 0) refuse(`--samples folder is missing: ${missing.map(([name]) => name).join(", ")}`);
}

function refuse(message) {
  console.error(`\n[direct-upload] REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(1);
}

if (TARGET !== "staging" && TARGET !== "production") refuse("--target=staging or --target=production is required.");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  refuse("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set (never printed).");
}

let project;
try {
  project = assertTarget(TARGET, { supabaseUrl, expectedStagingRef: process.env.STAGING_SUPABASE_REF || null });
} catch (err) {
  refuse(err.message);
}

let site;
try {
  site = assertSmokeTarget(TARGET, TARGET === "production" ? CANONICAL_PRODUCTION_ORIGIN : process.env.QA_BASE_URL ?? "");
} catch (err) {
  refuse(err.message);
}
const BASE = site.origin;
const SHORT_CODE = QA_TAGS[TARGET];

console.log(`\n[direct-upload] target verified: ${TARGET.toUpperCase()} (project host ${project.host}, site host ${site.host}), QA tag ${SHORT_CODE}`);
console.log("  - submissions bucket settings (read-only)");
console.log(`  - anon direct upload refused${AFTER_0037 ? "" : " — SKIPPED until --after-0037"}`);
console.log("  - public damage report: 5 generated photos, more than 4.5 MB");
console.log("  - clean public return checklist: generated photos in two slots, more than 4.5 MB");
console.log(`  - photo formats (HEIC, AVIF, GIF converted on the device)${SAMPLES ? "" : " — SKIPPED without --samples=<dir>"}`);
if (!CONFIRMED) {
  console.log("\n  DRY RUN — nothing written or submitted. Pass --confirm to run.\n");
  process.exit(0);
}

const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
const run = createRun({ label: `direct-upload-${TARGET}`, target: TARGET, host: site.host });
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const firstLine = (err) => String(err?.message ?? err).split("\n")[0].slice(0, 160);

const { data: link, error: linkError } = await service
  .from("qr_links")
  .select("asset_id, organization_id")
  .eq("short_code", SHORT_CODE)
  .maybeSingle();
if (linkError || !link) refuse(`the QA tag ${SHORT_CODE} does not resolve on this project.`);

// ---------------------------------------------------------------------------
// Storage settings and the closed anon policy
// ---------------------------------------------------------------------------

const { data: bucket, error: bucketError } = await service.storage.getBucket("submissions");
if (bucketError || !bucket) {
  run.fail("bucket", "submissions settings readable", "could not read the bucket");
} else {
  const types = [...(bucket.allowed_mime_types ?? [])].sort();
  const note = `public ${bucket.public}, file_size_limit ${bucket.file_size_limit ?? "none"}, types ${types.join(" ") || "any"}`;
  if (AFTER_0037) {
    run.check(
      "bucket",
      "submissions is private, 10 MB, JPEG/PNG/WebP only (0037)",
      bucket.public === false && bucket.file_size_limit === EXPECTED_FILE_SIZE_LIMIT && types.join() === EXPECTED_TYPES.join(),
      note
    );
  } else {
    run.check("bucket", "submissions is private (0037 limits not asserted yet)", bucket.public === false, note);
  }
}

if (AFTER_0037) {
  const probePath = `org/${link.organization_id}/asset/${link.asset_id}/submission/${randomUUID()}/${randomUUID()}.png`;
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#808080" } }).png().toBuffer();
  const { error } = await anon.storage.from("submissions").upload(probePath, png, { contentType: "image/png" });
  if (error) {
    run.pass("storage", "anon direct upload into submissions is refused", "refused");
  } else {
    await service.storage.from("submissions").remove([probePath]);
    run.fail("storage", "anon direct upload into submissions is refused", "ACCEPTED (probe removed) — the anon insert policy is still in place");
  }
} else {
  run.skip("storage", "anon direct upload into submissions is refused", "pass --after-0037 once the migration is applied");
}

// ---------------------------------------------------------------------------
// Generated photos — labelled, noisy enough to be photo-sized
// ---------------------------------------------------------------------------

function photoPixels(width, height, hue) {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = hue * 7919 + 13;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const jitter = (seed & 0x7f) - 64;
      const i = (y * width + x) * 3;
      pixels[i] = Math.max(0, Math.min(255, (((x / width) * 200 + hue) % 256) + jitter));
      pixels[i + 1] = Math.max(0, Math.min(255, (y / height) * 180 + jitter));
      pixels[i + 2] = Math.max(0, Math.min(255, 120 + jitter));
    }
  }
  return pixels;
}

async function qaPhoto(label, hue, width, height) {
  const size = Math.round(height / 10);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      ["MULEMARK UPLOAD QA", label]
        .map((line, i) => `<text x="50%" y="${40 + i * 20}%" font-size="${size}" text-anchor="middle" font-family="Arial, sans-serif" fill="#ffffff" stroke="#000000" stroke-width="4">${line}</text>`)
        .join("") +
      "</svg>"
  );
  const buffer = await sharp(photoPixels(width, height, hue), { raw: { width, height, channels: 3 } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
  return { name: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`, mimeType: "image/jpeg", buffer };
}

function exceedsRequestLimit(area, files) {
  const total = files.reduce((sum, f) => sum + f.buffer.length, 0);
  const largest = Math.max(...files.map((f) => f.buffer.length));
  const ok = total > REQUEST_LIMIT_BYTES && largest < EXPECTED_FILE_SIZE_LIMIT;
  run.check(area, "generated photos exceed the 4.5 MB request limit (each under 10 MB)", ok, `${files.length} photos, ${mb(total)}`);
  return ok;
}

// ---------------------------------------------------------------------------
// Browser and read-back
// ---------------------------------------------------------------------------

const browser = await chromium.launch();
const bypass = bypassHeaders();

async function openPage(path) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Only the site gets the bypass header; photo PUTs go to Supabase storage and must not carry it.
  if (Object.keys(bypass).length > 0) {
    await context.route(`${BASE}/**`, (route) => route.continue({ headers: { ...route.request().headers(), ...bypass } }));
  }
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 });
  // Photos must go through the hydrated form (direct upload), not a pre-hydration native post.
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  return { context, page };
}

async function awaitConfirmation(area, page, pattern, clickedAt) {
  const reached = await page.waitForURL(pattern, { timeout: CONFIRMATION_TIMEOUT_MS }).then(
    () => true,
    () => false
  );
  if (!reached) {
    const alert = await page.getByRole("alert").first().textContent({ timeout: 1_000 }).catch(() => null);
    run.fail(area, "confirmation page reached", alert ? `form says: ${alert.slice(0, 140)}` : "no confirmation in time");
    await run.capture(page, area);
    return false;
  }
  const text = (await page.getByText(REFERENCE_RE).first().textContent({ timeout: 30_000 }).catch(() => "")) ?? "";
  const reference = text.match(REFERENCE_RE);
  run.pass(area, "confirmation page reached", `${reference ? reference[0] : "no reference shown"} in ${Date.now() - clickedAt} ms`);
  return true;
}

async function verifyRow(area, formType, sentFiles, since) {
  const { data: row, error } = await service
    .from("form_submissions")
    .select("media_urls")
    .eq("asset_id", link.asset_id)
    .eq("form_type", formType)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !row) {
    run.fail(area, "row written", error ? "row read failed" : "no new row");
    return;
  }
  const paths = Array.isArray(row.media_urls) ? row.media_urls : [];
  run.check(area, `row holds all ${sentFiles.length} photos`, paths.length === sentFiles.length, `${paths.length} stored`);

  const shape = new RegExp(
    `^org/${link.organization_id}/asset/${link.asset_id}/submission/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp)$`
  );
  const folders = new Set(paths.map((p) => String(p).slice(0, String(p).lastIndexOf("/"))));
  const shaped = paths.length > 0 && paths.every((p) => typeof p === "string" && shape.test(p)) && folders.size === 1;
  run.check(area, "every stored path is under one submission prefix of the QA asset", shaped);
  if (!shaped) return;

  const [folder] = folders;
  const { data: objects, error: listError } = await service.storage.from("submissions").list(folder, { limit: 100 });
  if (listError) {
    run.fail(area, "objects present in storage", "listing failed");
    return;
  }
  const sizeByName = new Map((objects ?? []).map((o) => [o.name, Number(o.metadata?.size ?? -1)]));
  const stored = paths.map((p) => sizeByName.get(p.slice(p.lastIndexOf("/") + 1)) ?? -1).sort((a, b) => a - b);
  const sent = sentFiles.map((f) => f.buffer.length).sort((a, b) => a - b);
  run.check(
    area,
    "every object is in storage at the size sent, nothing extra",
    stored.every((s) => s > 0) && stored.join() === sent.join() && (objects ?? []).length === paths.length,
    `${(objects ?? []).length} objects, ${mb(stored.reduce((sum, s) => sum + Math.max(s, 0), 0))}`
  );
}

// Database clocks and this machine's clock can disagree by seconds; a minute of slack is plenty for one run.
const sinceNow = () => new Date(Date.now() - 60_000).toISOString();

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function damageScenario() {
  const area = "damage";
  const files = [];
  for (let i = 0; i < 5; i++) files.push(await qaPhoto(`Damage photo ${i + 1} of 5`, 30 + i * 45, 3000, 2000));
  if (!exceedsRequestLimit(area, files)) return;

  const since = sinceNow();
  const { context, page } = await openPage(`/forms/${SHORT_CODE}/damage`);
  try {
    await page.getByLabel("Your name").fill("Direct upload QA");
    await page.getByRole("textbox", { name: "Email" }).fill("direct-upload-qa@example.test");
    await page
      .getByLabel("What's damaged?")
      .fill("Direct photo upload QA: five photos over 4.5 MB. Automated test data, not a customer report.");
    await page.locator('input[name="media"]').setInputFiles(files);
    const clickedAt = Date.now();
    await page.getByRole("button", { name: "Submit damage report" }).click();
    if (await awaitConfirmation(area, page, /\/damage\/thanks/, clickedAt)) {
      await verifyRow(area, "damage_report", files, since);
    }
  } finally {
    await context.close();
  }
}

async function answerConditionStage(page) {
  const groups = page.locator('fieldset[id^="field-"]:visible');
  await groups.first().waitFor({ state: "visible", timeout: 30_000 });
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const group = groups.nth(i);
    const id = (await group.getAttribute("id")) ?? "";
    if (/damage/.test(id)) await group.getByText("No", { exact: true }).click();
    else await group.locator("label").first().click();
  }
}

async function returnScenario() {
  const area = "return";
  const photos = [await qaPhoto("Return slot A", 200, 3600, 2400), await qaPhoto("Return slot B", 260, 3600, 2400)];
  if (!exceedsRequestLimit(area, photos)) return;

  const since = sinceNow();
  const { context, page } = await openPage(`/forms/${SHORT_CODE}/return`);
  try {
    if (!(await visible(page.getByText(/Step 1 of 3/), 30_000))) {
      run.skip(area, "return checklist with photos", "the QA tag has no guided return checklist");
      return;
    }
    await answerConditionStage(page);

    // Every stage stays mounted, so all photo inputs exist now. Prefer the condition slots over the extra-photos slot.
    const names = await page
      .locator('input[type="file"][name^="photo:"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("name")));
    const eligible = names.filter((n) => n && n !== "photo:damage_photos");
    const slots = [...eligible.filter((n) => n !== "photo:additional_photos"), ...eligible.filter((n) => n === "photo:additional_photos")];
    if (slots.length === 0) {
      run.skip(area, "return checklist with photos", "the QA template has no photo slot");
      return;
    }
    if (slots.length === 1) {
      await page.locator(`input[name="${slots[0]}"]`).setInputFiles(photos);
    } else {
      await page.locator(`input[name="${slots[0]}"]`).setInputFiles(photos[0]);
      await page.locator(`input[name="${slots[1]}"]`).setInputFiles(photos[1]);
    }

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText(/Step 2 of 3/).first().waitFor({ timeout: 30_000 });
    const attestation = page.getByRole("checkbox");
    if ((await attestation.count()) > 0) await attestation.first().check();
    await page.getByRole("button", { name: "Review return checklist" }).click();
    await page.getByText(/Step 3 of 3/).first().waitFor({ timeout: 30_000 });
    const clickedAt = Date.now();
    await page.getByRole("button", { name: "Submit return checklist" }).click();
    const dialog = page.locator("dialog[open]");
    if (await visible(dialog, 3_000)) await dialog.getByRole("button", { name: /Submit/ }).first().click();
    if (await awaitConfirmation(area, page, /\/return\/thanks/, clickedAt)) {
      await verifyRow(area, "return_checklist", photos, since);
    }
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Photo formats (D4.1) — public sample files, converted on the device
// ---------------------------------------------------------------------------

function sample(key) {
  const [name, mimeType] = SAMPLE_FILES[key];
  return { name, mimeType, buffer: readFileSync(join(SAMPLES, name)) };
}

/** Wait until the page has replaced the picked files with prepared ones (named photo-N). */
async function waitPrepared(page, selector, count) {
  await page.waitForFunction(
    ([sel, n]) => {
      const files = Array.from(document.querySelector(sel)?.files ?? []);
      return files.length === n && files.every((file) => file.name.startsWith("photo-"));
    },
    [selector, count],
    { timeout: 90_000 }
  );
}

async function verifyConvertedRow(area, formType, expected, since) {
  const { data: row, error } = await service
    .from("form_submissions")
    .select("media_urls")
    .eq("asset_id", link.asset_id)
    .eq("form_type", formType)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !row) {
    run.fail(area, "row written", error ? "row read failed" : "no new row");
    return;
  }
  const paths = Array.isArray(row.media_urls) ? row.media_urls : [];
  run.check(area, `row holds all ${expected} photos`, paths.length === expected, `${paths.length} stored`);
  const shape = new RegExp(`^org/${link.organization_id}/asset/${link.asset_id}/submission/[0-9a-f-]{36}/[0-9a-f-]{36}\\.jpg$`);
  const folders = new Set(paths.map((p) => String(p).slice(0, String(p).lastIndexOf("/"))));
  const shaped = paths.length > 0 && paths.every((p) => typeof p === "string" && shape.test(p)) && folders.size === 1;
  run.check(area, "every photo is stored as a JPEG under one submission prefix", shaped);
  if (!shaped) return;

  const [folder] = folders;
  const { data: objects, error: listError } = await service.storage.from("submissions").list(folder, { limit: 100 });
  if (listError) {
    run.fail(area, "objects present in storage", "listing failed");
    return;
  }
  const sizes = (objects ?? []).map((o) => Number(o.metadata?.size ?? -1));
  run.check(
    area,
    "every object is in storage, under 10 MB, nothing extra",
    sizes.length === paths.length && sizes.every((s) => s > 0 && s <= EXPECTED_FILE_SIZE_LIMIT),
    `${sizes.length} objects, ${mb(sizes.reduce((sum, s) => sum + Math.max(s, 0), 0))}`
  );
  const { data: blob, error: downloadError } = await service.storage.from("submissions").download(paths[0]);
  if (downloadError || !blob) {
    run.fail(area, "a stored photo decodes as a JPEG without EXIF", "download failed");
    return;
  }
  const meta = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
  run.check(area, "a stored photo decodes as a JPEG without EXIF", meta.format === "jpeg" && !meta.exif, `${meta.width}×${meta.height}`);
}

async function formatsDamageScenario() {
  const area = "formats-damage";
  const files = [sample("heic"), sample("avif"), sample("gif")];
  const since = sinceNow();
  const { context, page } = await openPage(`/forms/${SHORT_CODE}/damage`);
  try {
    await page.getByLabel("Your name").fill("Photo format QA");
    await page.getByRole("textbox", { name: "Email" }).fill("direct-upload-qa@example.test");
    await page
      .getByLabel("What's damaged?")
      .fill("Photo format QA: HEIC, AVIF and GIF sample photos. Automated test data, not a customer report.");
    await page.locator('input[name="media"]').setInputFiles(files);
    await waitPrepared(page, 'input[name="media"]', files.length);
    const clickedAt = Date.now();
    await page.getByRole("button", { name: "Submit damage report" }).click();
    if (await awaitConfirmation(area, page, /\/damage\/thanks/, clickedAt)) {
      await verifyConvertedRow(area, "damage_report", files.length, since);
    }
  } finally {
    await context.close();
  }
}

async function formatsReturnScenario() {
  const area = "formats-return";
  const photos = [sample("heic"), sample("grid")];
  const since = sinceNow();
  const { context, page } = await openPage(`/forms/${SHORT_CODE}/return`);
  try {
    if (!(await visible(page.getByText(/Step 1 of 3/), 30_000))) {
      run.skip(area, "return checklist with sample photos", "the QA tag has no guided return checklist");
      return;
    }
    await answerConditionStage(page);
    const names = await page
      .locator('input[type="file"][name^="photo:"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("name")));
    const eligible = names.filter((n) => n && n !== "photo:damage_photos");
    const slots = [...eligible.filter((n) => n !== "photo:additional_photos"), ...eligible.filter((n) => n === "photo:additional_photos")];
    if (slots.length === 0) {
      run.skip(area, "return checklist with sample photos", "the QA template has no photo slot");
      return;
    }
    if (slots.length === 1) {
      await page.locator(`input[name="${slots[0]}"]`).setInputFiles(photos);
      await waitPrepared(page, `input[name="${slots[0]}"]`, 2);
    } else {
      await page.locator(`input[name="${slots[0]}"]`).setInputFiles(photos[0]);
      await page.locator(`input[name="${slots[1]}"]`).setInputFiles(photos[1]);
      await waitPrepared(page, `input[name="${slots[0]}"]`, 1);
      await waitPrepared(page, `input[name="${slots[1]}"]`, 1);
    }

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText(/Step 2 of 3/).first().waitFor({ timeout: 30_000 });
    const attestation = page.getByRole("checkbox");
    if ((await attestation.count()) > 0) await attestation.first().check();
    await page.getByRole("button", { name: "Review return checklist" }).click();
    await page.getByText(/Step 3 of 3/).first().waitFor({ timeout: 30_000 });
    const clickedAt = Date.now();
    await page.getByRole("button", { name: "Submit return checklist" }).click();
    const dialog = page.locator("dialog[open]");
    if (await visible(dialog, 3_000)) await dialog.getByRole("button", { name: /Submit/ }).first().click();
    if (await awaitConfirmation(area, page, /\/return\/thanks/, clickedAt)) {
      await verifyConvertedRow(area, "return_checklist", photos.length, since);
    }
  } finally {
    await context.close();
  }
}

try {
  for (const [area, scenario] of [
    ["damage", damageScenario],
    ["return", returnScenario],
    ...(SAMPLES
      ? [
          ["formats-damage", formatsDamageScenario],
          ["formats-return", formatsReturnScenario],
        ]
      : []),
  ]) {
    try {
      await scenario();
    } catch (err) {
      run.fail(area, "scenario ran", firstLine(err));
    }
  }
} finally {
  await browser.close();
}

process.exit(run.report() ? 0 : 1);
