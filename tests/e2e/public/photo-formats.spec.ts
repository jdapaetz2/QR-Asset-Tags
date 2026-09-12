import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { answerConditionStage, largeJpeg, tinyPng } from "../support/actions";
import { ROLES } from "../support/roles";
import {
  createAsset,
  createRentedStaffAsset,
  readAssetCover,
  readAssetDocuments,
  readLatestSubmissionMedia,
} from "../support/seed";

/**
 * Engineering Phase D4.1 — photos from phones and computers in the formats they really produce. Picked photos are
 * identified by their bytes and prepared on the device (lib/media/consumer-photo/): web-safe photos that fit are kept,
 * HEIC, AVIF, GIF and very large photos become JPEG, and anything unusable is listed while the rest carry on. Chromium
 * cannot decode HEIC itself, so these runs exercise the on-demand libheif decoder (public/workers/photo-worker.js).
 *
 * The sample photos are public, clearly licensed files kept OUTSIDE the repository (docs/STORAGE_MEDIA_LIFECYCLE.md);
 * set MEDIA_FIXTURES_DIR to their folder. Without it these tests are skipped.
 */
const FIXTURES = process.env.MEDIA_FIXTURES_DIR ?? "";
test.skip(!FIXTURES || !existsSync(FIXTURES), "MEDIA_FIXTURES_DIR is not set to the public sample photo folder");
test.use({ viewport: { width: 390, height: 844 } });

const PREPARE_TIMEOUT_MS = 60_000;

const sample = (name: string, mimeType: string) => ({ name, mimeType, buffer: readFileSync(join(FIXTURES, name)) });

const objectPath = (assetId: string, ext: string) =>
  new RegExp(`^org/[0-9a-f-]{36}/asset/${assetId}/submission/[0-9a-f-]{36}/[0-9a-f-]{36}\\.${ext}$`);

/** The files an input holds once preparation has finished, as "name|type". */
async function expectPrepared(page: Page, selector: string, expected: string[]) {
  await expect
    .poll(
      () =>
        page
          .locator(selector)
          .evaluate((input) => Array.from((input as HTMLInputElement).files ?? []).map((file) => `${file.name}|${file.type}`)),
      { timeout: PREPARE_TIMEOUT_MS }
    )
    .toEqual(expected);
}

async function fillDamage(page: Page) {
  await page.getByLabel("Your name").fill("Renter Rita");
  await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
  await page.getByLabel("What's damaged?").fill("Cracked step");
}

async function submitDamage(page: Page) {
  await page.getByRole("button", { name: "Submit damage report" }).click();
  await page.waitForURL(/\/damage\/thanks\?ref=SUB-/, { timeout: PREPARE_TIMEOUT_MS });
}

test("a HEIC photo is converted on the device and the damage report submits @critical", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/damage`);
  await fillDamage(page);
  await page.locator('input[name="media"]').setInputFiles(sample("example.heic", "image/heic"));
  await expectPrepared(page, 'input[name="media"]', ["photo-1.jpg|image/jpeg"]);
  await submitDamage(page);

  const media = await readLatestSubmissionMedia(assetId, "damage_report");
  expect(media).toHaveLength(1);
  expect(media[0]).toMatch(objectPath(assetId, "jpg"));
});

test("JPEG, PNG, AVIF and GIF photos in one report are kept or converted by their bytes", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/damage`);
  await fillDamage(page);
  await page.locator('input[name="media"]').setInputFiles([
    await largeJpeg("camera.jpg", 1_000_000),
    tinyPng("screenshot.png"),
    // A wrong declared type: the bytes decide.
    { ...sample("paris_icc_exif_xmp.avif", "application/octet-stream") },
    sample("knowledge-animated-transparent.gif", "image/gif"),
  ]);
  await expectPrepared(page, 'input[name="media"]', [
    "photo-1.jpg|image/jpeg",
    "photo-2.png|image/png",
    "photo-3.jpg|image/jpeg",
    "photo-4.jpg|image/jpeg",
  ]);
  await submitDamage(page);

  const media = await readLatestSubmissionMedia(assetId, "damage_report");
  expect(media.map((path) => path.split(".").pop())).toEqual(["jpg", "png", "jpg", "jpg"]);
});

test("a 44 MP camera JPEG over 10 MB is converted to fit and uploaded", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/damage`);
  await fillDamage(page);
  await page.locator('input[name="media"]').setInputFiles(sample("gazania-44mp.jpg", "image/jpeg"));
  await expectPrepared(page, 'input[name="media"]', ["photo-1.jpg|image/jpeg"]);
  const size = await page.locator('input[name="media"]').evaluate((input) => (input as HTMLInputElement).files?.[0]?.size ?? 0);
  expect(size).toBeLessThanOrEqual(10 * 1024 * 1024);
  await submitDamage(page);
  expect(await readLatestSubmissionMedia(assetId, "damage_report")).toHaveLength(1);
});

test("a photo that cannot be prepared is listed with guidance and the others still submit", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/damage`);
  await fillDamage(page);
  const heic = readFileSync(join(FIXTURES, "example.heic"));
  const broken = { name: "IMG_0042.HEIC", mimeType: "image/heic", buffer: Buffer.concat([heic.subarray(0, 32), Buffer.alloc(50_000, 7)]) };
  await page.locator('input[name="media"]').setInputFiles([broken, tinyPng("good.png")]);
  await expectPrepared(page, 'input[name="media"]', ["photo-2.png|image/png"]);
  await expect(page.getByText(/IMG_0042\.HEIC: This photo couldn't be prepared/)).toBeVisible();
  await submitDamage(page);
  const media = await readLatestSubmissionMedia(assetId, "damage_report");
  expect(media).toHaveLength(1);
  expect(media[0]).toMatch(objectPath(assetId, "png"));
});

test("a return checklist takes a HEIC and an AVIF in different slots", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/return`);
  await answerConditionStage(page, { damage: false });
  await page.locator('input[name="photo:front_hitch_photo"]').setInputFiles(sample("example.heic", "image/heic"));
  await page.locator('input[name="photo:deck_photo"]').setInputFiles(sample("sofa_grid1x5_420.avif", "image/avif"));
  await expectPrepared(page, 'input[name="photo:front_hitch_photo"]', ["photo-1.jpg|image/jpeg"]);
  await expectPrepared(page, 'input[name="photo:deck_photo"]', ["photo-1.jpg|image/jpeg"]);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review return checklist" }).click();
  await page.getByRole("button", { name: "Submit return checklist" }).click();
  const dialog = page.locator("dialog[open]");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Submit without photos" }).click();
  }

  await page.waitForURL(/\/return\/thanks/, { timeout: PREPARE_TIMEOUT_MS });
  const media = await readLatestSubmissionMedia(assetId, "return_checklist");
  expect(media).toHaveLength(2);
  for (const path of media) expect(path).toMatch(objectPath(assetId, "jpg"));
});

test.describe("staff", () => {
  test.use({ storageState: ROLES.staff.storageState });

  test("a staff return takes HEIC and AVIF photos", async ({ page }) => {
    const { assetId, shortCode } = await createRentedStaffAsset();
    await page.goto(`/staff/t/${shortCode}/return`);
    await answerConditionStage(page, { damage: false });
    const slots = page.locator('input[type="file"][name^="photo:"]');
    await slots.nth(0).setInputFiles(sample("example.heic", "image/heic"));
    await slots.nth(1).setInputFiles(sample("abc_color_irot_alpha_irot.avif", "image/avif"));
    const first = await slots.nth(0).getAttribute("name");
    const second = await slots.nth(1).getAttribute("name");
    await expectPrepared(page, `input[name="${first}"]`, ["photo-1.jpg|image/jpeg"]);
    await expectPrepared(page, `input[name="${second}"]`, ["photo-1.jpg|image/jpeg"]);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Review return checklist" }).click();
    await page.getByRole("button", { name: "Complete return checklist" }).click();
    const dialog = page.locator("dialog[open]");
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.getByRole("button", { name: "Submit without photos" }).click();
    }

    await page.waitForURL(/\/return\/complete/, { timeout: PREPARE_TIMEOUT_MS });
    const media = await readLatestSubmissionMedia(assetId, "return_checklist");
    expect(media).toHaveLength(2);
    for (const path of media) expect(path).toMatch(objectPath(assetId, "jpg"));
  });
});

test.describe("admin", () => {
  test.use({ storageState: ROLES.admin.storageState, viewport: { width: 1280, height: 900 } });

  test("a HEIC cover image is converted to JPEG before it is stored", async ({ page }) => {
    const { assetId } = await createAsset();
    await page.goto(`/dashboard/assets/${assetId}`);
    const assetForm = page.locator("form", { has: page.locator('input[name="file"]') });
    await assetForm.locator('input[name="file"]').setInputFiles(sample("example.heic", "image/heic"));
    await expectPrepared(page, 'form input[name="file"]', ["photo-1.jpg|image/jpeg"]);
    await assetForm.getByRole("button", { name: "Save changes", exact: true }).click();

    await expect
      .poll(() => readAssetCover(assetId), { timeout: PREPARE_TIMEOUT_MS })
      .toMatch(new RegExp(`/public-assets/org/[0-9a-f-]{36}/asset/${assetId}/cover/[0-9a-f-]{36}\\.jpg$`));
  });

  test("an untyped HEIC document is kept as the original and offered as a download", async ({ page }) => {
    const { assetId } = await createAsset();
    const title = `Warranty photo ${assetId.slice(0, 8)}`;
    await page.goto(`/dashboard/assets/${assetId}/documents`);
    await page.getByLabel("Title").fill(title);
    // Windows leaves a HEIC untyped: the form identifies it by its bytes, and never converts a document.
    await page.locator('input[name="file"]').setInputFiles(sample("example.heic", "application/octet-stream"));
    await page.getByRole("button", { name: "Add document" }).click();

    await expect.poll(async () => (await readAssetDocuments(assetId)).length, { timeout: PREPARE_TIMEOUT_MS }).toBe(1);
    const [document] = await readAssetDocuments(assetId);
    expect(document.storage_path).toMatch(new RegExp(`^org/[0-9a-f-]{36}/asset/${assetId}/documents/([0-9a-f-]{36})/\\1\\.heic$`));
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row.getByRole("link", { name: "Download original" })).toBeVisible({ timeout: PREPARE_TIMEOUT_MS });
    await expect(row.getByText(/HEIC image · \d/)).toBeVisible();
  });
});
