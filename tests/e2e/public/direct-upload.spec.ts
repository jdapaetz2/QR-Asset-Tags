import { test, expect, type Page } from "@playwright/test";

import { answerConditionStage, largeJpeg, tinyPng } from "../support/actions";
import { countSubmissions, createAsset, readLatestSubmissionMedia } from "../support/seed";

/**
 * Photos beyond the platform's request-body limit. Vercel refuses any Function body over 4.5 MB (413) before the app
 * runs; locally `bodySizeLimit` is 4 MB to match. With JavaScript the forms upload photos straight to storage through
 * server-issued signed URLs and submit only text plus the uploaded paths (lib/forms/upload-contract.ts). Disposable
 * assets throughout; mobile viewport, like the renter at the machine.
 */
test.use({ viewport: { width: 390, height: 844 } });

const OBJECT_PATH = (assetId: string, ext = "jpg") =>
  new RegExp(`^org/[0-9a-f-]{36}/asset/${assetId}/submission/[0-9a-f-]{36}/[0-9a-f-]{36}\\.${ext}$`);

function mediaFileCount(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((element) => (element as HTMLInputElement).files?.length ?? 0);
}

async function fillDamage(page: Page) {
  await page.getByLabel("Your name").fill("Renter Rita");
  await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
  await page.getByLabel("What's damaged?").fill("Bent loader arm");
}

test("a damage report with 7.5 MB of photos uploads directly and submits @critical", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/damage`);
  await fillDamage(page);
  await page
    .locator('input[name="media"]')
    .setInputFiles([largeJpeg("one.jpg"), largeJpeg("two.jpg"), largeJpeg("three.jpg")]);
  await page.getByRole("button", { name: "Submit damage report" }).click();

  await page.waitForURL(/\/damage\/thanks\?ref=SUB-/, { timeout: 60_000 });
  const media = await readLatestSubmissionMedia(assetId, "damage_report");
  expect(media).toHaveLength(3);
  for (const path of media) expect(path).toMatch(OBJECT_PATH(assetId));
});

test("a return checklist uploads photos from two slots directly", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/return`);
  await answerConditionStage(page, { damage: false });
  await page.locator('input[name="photo:front_hitch_photo"]').setInputFiles(largeJpeg("front.jpg"));
  await page.locator('input[name="photo:deck_photo"]').setInputFiles(largeJpeg("deck.jpg"));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 2 of 3 · Return details")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review return checklist" }).click();
  await page.getByRole("button", { name: "Submit return checklist" }).click();
  const dialog = page.locator("dialog[open]");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Submit without photos" }).click();
  }

  await page.waitForURL(/\/return\/thanks/, { timeout: 60_000 });
  const media = await readLatestSubmissionMedia(assetId, "return_checklist");
  expect(media).toHaveLength(2);
  for (const path of media) expect(path).toMatch(OBJECT_PATH(assetId));
});

test.describe("a request the platform refuses keeps the form", () => {
  async function refuseServerActions(page: Page, shortCode: string) {
    await page.route(`**/forms/${shortCode}/damage`, async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await route.fulfill({ status: 413, contentType: "text/plain; charset=utf-8", body: "" });
        return;
      }
      await route.continue();
    });
  }

  test("with photos: the upload error shows and every answer and photo stays @critical", async ({ page }) => {
    const { assetId, shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/damage`);
    await fillDamage(page);
    await page.locator('input[name="media"]').setInputFiles(tinyPng());
    await refuseServerActions(page, shortCode);
    await page.getByRole("button", { name: "Submit damage report" }).click();

    await expect(page.getByText("We couldn't upload your photos.")).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveValue("Renter Rita");
    await expect(page.getByLabel("What's damaged?")).toHaveValue("Bent loader arm");
    expect(await mediaFileCount(page, 'input[name="media"]')).toBe(1);
    expect(await countSubmissions(assetId, "damage_report")).toBe(0);
  });

  test("without photos: the send error shows instead of the framework error page", async ({ page }) => {
    const { assetId, shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/damage`);
    await fillDamage(page);
    await refuseServerActions(page, shortCode);
    await page.getByRole("button", { name: "Submit damage report" }).click();

    await expect(page.getByText("We couldn't send this.")).toBeVisible();
    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
    await expect(page.getByLabel("Your name")).toHaveValue("Renter Rita");
    expect(await countSubmissions(assetId, "damage_report")).toBe(0);
  });
});

// The no-JavaScript file post (a plain form post, photos under 4 MB) is covered end to end by
// tests/e2e/public/no-javascript.spec.ts.
