#!/usr/bin/env node
/**
 * Admin direct upload verification — hosted documents and cover images past Vercel's 4.5 MB request-body limit.
 * STAGING ONLY.
 *
 * WHAT IT DOES, against the staging Preview and the staging Supabase project:
 *   1. Reads the `public-assets` bucket settings (0038: 5 MB, JPEG/PNG/WebP).
 *   2. Signs in as the seeded QA admin and adds a hosted document with a generated 12 MB PDF to the QA asset, then reads
 *      the row back: one row, its storage path shaped `org/{org}/asset/{asset}/documents/{id}/{id}.pdf`, and the object
 *      in storage at the size sent. The QA document and its object are then deleted.
 *   3. Saves a generated 4.8 MB JPEG as the QA asset's cover image and reads it back: the cover URL points at a new
 *      object under the asset's cover folder, stored at the size sent. The original cover URL is then restored and the
 *      QA object removed. Skipped when the QA asset's current cover is itself an uploaded object (saving a new cover
 *      would delete it).
 *
 * REFUSALS: the Supabase project must resolve to staging (env-target.mjs) and QA_BASE_URL to a Preview host
 * (smoke-target.mjs); the tag is the fixed seeded QA tag; without --confirm it prints the plan and writes nothing.
 * NO secret, storage path or signed URL is printed; the bypass secret is sent only to the site origin.
 *
 * Usage: node --env-file=.env.staging.local scripts/qa/admin-upload-verify.mjs --target=staging --confirm
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

import { assertTarget } from "../lib/env-target.mjs";
import { assertSmokeTarget } from "../lib/smoke-target.mjs";
import { bypassHeaders, createRun } from "../smoke/lib/runner.mjs";

const QA_SHORT_CODE = "stg-qa-public";
const QA_ADMIN = "qa.admin@mulemark-staging.invalid";
const DOCUMENT_BYTES = 12_000_000;
const COVER_BYTES = 4_800_000;
const SAVE_TIMEOUT_MS = 90_000;

const args = process.argv.slice(2);
const TARGET = (args.find((a) => a.startsWith("--target=")) ?? "").slice("--target=".length);
const CONFIRMED = args.includes("--confirm");

function refuse(message) {
  console.error(`\n[admin-upload] REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(1);
}

if (TARGET !== "staging") refuse("--target=staging is required (Production is verified separately, after its migration).");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const password = process.env.STAGING_QA_PASSWORD || process.env.QA_PASSWORD || "";
if (!supabaseUrl || !serviceRoleKey || !password) {
  refuse("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STAGING_QA_PASSWORD must be set (never printed).");
}

let project;
try {
  project = assertTarget("staging", { supabaseUrl, expectedStagingRef: process.env.STAGING_SUPABASE_REF || null });
} catch (err) {
  refuse(err.message);
}
let site;
try {
  site = assertSmokeTarget("staging", process.env.QA_BASE_URL ?? "");
} catch (err) {
  refuse(err.message);
}
const BASE = site.origin;

console.log(`\n[admin-upload] target verified: STAGING (project host ${project.host}, site host ${site.host}), QA tag ${QA_SHORT_CODE}`);
console.log("  - public-assets bucket settings (read-only)");
console.log("  - hosted document: generated 12 MB PDF (then deleted)");
console.log("  - cover image: generated 4.8 MB JPEG (original cover restored)");
if (!CONFIRMED) {
  console.log("\n  DRY RUN — nothing written. Pass --confirm to run.\n");
  process.exit(0);
}

const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const run = createRun({ label: "admin-upload-staging", target: "staging", host: site.host });
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const firstLine = (err) => String(err?.message ?? err).split("\n")[0].slice(0, 160);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { data: link } = await service.from("qr_links").select("asset_id, organization_id").eq("short_code", QA_SHORT_CODE).maybeSingle();
if (!link) refuse(`the QA tag ${QA_SHORT_CODE} does not resolve on this project.`);
const { asset_id: assetId, organization_id: orgId } = link;

async function poll(read, done, timeoutMs = SAVE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await sleep(1_000);
    value = await read();
  }
  return value;
}

async function objectSize(bucket, folder, name) {
  const { data, error } = await service.storage.from(bucket).list(folder, { limit: 100 });
  if (error) return null;
  const entry = (data ?? []).find((object) => object.name === name);
  return entry ? Number(entry.metadata?.size ?? -1) : null;
}

// ---------------------------------------------------------------------------
// Bucket settings
// ---------------------------------------------------------------------------

{
  const { data: bucket } = await service.storage.getBucket("public-assets");
  const types = [...(bucket?.allowed_mime_types ?? [])].sort();
  run.check(
    "bucket",
    "public-assets is 5 MB, JPEG/PNG/WebP only (0038)",
    bucket?.file_size_limit === 5242880 && types.join() === "image/jpeg,image/png,image/webp",
    `file_size_limit ${bucket?.file_size_limit ?? "none"}, types ${types.join(" ") || "any"}`
  );
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const bypass = bypassHeaders();
if (Object.keys(bypass).length > 0) {
  // Only the site gets the bypass header; the file PUTs go to Supabase storage and must not carry it.
  await context.route(`${BASE}/**`, (route) => route.continue({ headers: { ...route.request().headers(), ...bypass } }));
}
const page = await context.newPage();

async function signIn() {
  await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 60_000 });
  await page.getByLabel("Email").fill(QA_ADMIN);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

async function documentScenario() {
  const area = "document";
  const title = `Direct upload QA ${new Date().toISOString().slice(0, 19)}`;
  const pdf = Buffer.alloc(DOCUMENT_BYTES, 0x20);
  pdf.write("%PDF-1.7\n%Mulemark staging QA document\n", 0, "latin1");

  await page.goto(`${BASE}/dashboard/assets/${assetId}/documents`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.getByLabel("Title").fill(title);
  await page.locator('input[name="file"]').setInputFiles({ name: "qa-manual.pdf", mimeType: "application/pdf", buffer: pdf });
  const clickedAt = Date.now();
  await page.getByRole("button", { name: "Add document" }).click();

  const readRows = async () =>
    (await service.from("documents").select("id, storage_path").eq("asset_id", assetId).eq("title", title)).data ?? [];
  const rows = await poll(readRows, (value) => value.length > 0);
  if (rows.length !== 1) {
    const alert = await page.getByRole("alert").first().textContent({ timeout: 1_000 }).catch(() => null);
    run.fail(area, "document saved", alert ? `form says: ${alert.slice(0, 140)}` : `${rows.length} rows`);
    await run.capture(page, area);
    return;
  }
  const [row] = rows;
  run.pass(area, "document saved", `in ${Date.now() - clickedAt} ms, ${mb(DOCUMENT_BYTES)} file`);
  const shape = new RegExp(`^org/${orgId}/asset/${assetId}/documents/([0-9a-f-]{36})/\\1\\.pdf$`);
  const shaped = typeof row.storage_path === "string" && shape.test(row.storage_path) && row.storage_path.includes(row.id);
  run.check(area, "row references one object named after the document", shaped);

  if (shaped) {
    const folder = row.storage_path.slice(0, row.storage_path.lastIndexOf("/"));
    const name = row.storage_path.slice(row.storage_path.lastIndexOf("/") + 1);
    const size = await objectSize("documents", folder, name);
    run.check(area, "object stored at the size sent", size === DOCUMENT_BYTES, size === null ? "not found" : mb(size));
    await service.storage.from("documents").remove([row.storage_path]);
  }
  const { error: deleteError } = await service.from("documents").delete().eq("id", row.id);
  run.check(area, "QA document cleaned up", !deleteError);
}

async function coverScenario() {
  const area = "cover";
  const { data: before } = await service.from("assets").select("cover_image_url").eq("id", assetId).maybeSingle();
  const original = before?.cover_image_url ?? null;
  if (original && original.includes("/storage/v1/object/public/")) {
    run.skip(area, "cover image saved", "the QA asset's cover is an uploaded object; saving a new cover would delete it");
    return;
  }

  const jpeg = Buffer.alloc(COVER_BYTES, 0x5a);
  jpeg.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01], 0);

  await page.goto(`${BASE}/dashboard/assets/${assetId}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  // The asset page has more than one "Save changes" form; use the one that holds the cover image input.
  const assetForm = page.locator("form", { has: page.locator('input[name="file"]') });
  await assetForm.locator('input[name="file"]').setInputFiles({ name: "qa-cover.jpg", mimeType: "image/jpeg", buffer: jpeg });
  const clickedAt = Date.now();
  // Exact: the file input's own accessible name ends "…when you click Save changes".
  await assetForm.getByRole("button", { name: "Save changes", exact: true }).click();

  const marker = "/storage/v1/object/public/public-assets/";
  const readCover = async () =>
    (await service.from("assets").select("cover_image_url").eq("id", assetId).maybeSingle()).data?.cover_image_url ?? null;
  const cover = await poll(readCover, (value) => typeof value === "string" && value !== original && value.includes(marker));
  if (!(typeof cover === "string" && cover !== original && cover.includes(marker))) {
    const alert = await page.getByRole("alert").first().textContent({ timeout: 1_000 }).catch(() => null);
    run.fail(area, "cover image saved", alert ? `form says: ${alert.slice(0, 140)}` : "cover not updated in time");
    await run.capture(page, area);
    return;
  }
  run.pass(area, "cover image saved", `in ${Date.now() - clickedAt} ms, ${mb(COVER_BYTES)} image`);

  const objectPath = cover.slice(cover.indexOf(marker) + marker.length).split("?")[0];
  const shaped = new RegExp(`^org/${orgId}/asset/${assetId}/cover/[0-9a-f-]{36}\\.jpg$`).test(objectPath);
  run.check(area, "cover points at a new object in the asset's cover folder", shaped);
  if (shaped) {
    const folder = objectPath.slice(0, objectPath.lastIndexOf("/"));
    const size = await objectSize("public-assets", folder, objectPath.slice(objectPath.lastIndexOf("/") + 1));
    run.check(area, "object stored at the size sent", size === COVER_BYTES, size === null ? "not found" : mb(size));
  }

  const { error: restoreError } = await service.from("assets").update({ cover_image_url: original }).eq("id", assetId);
  if (shaped) await service.storage.from("public-assets").remove([objectPath]);
  run.check(area, "original cover restored", !restoreError);
}

try {
  await signIn();
  for (const [area, scenario] of [
    ["document", documentScenario],
    ["cover", coverScenario],
  ]) {
    try {
      await scenario();
    } catch (err) {
      run.fail(area, "scenario ran", firstLine(err));
      await run.capture(page, area);
    }
  }
} catch (err) {
  run.fail("login", "QA admin signed in", firstLine(err));
} finally {
  await browser.close();
}

process.exit(run.report() ? 0 : 1);
