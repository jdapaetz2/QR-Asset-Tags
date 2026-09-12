import { test, expect, type Page } from "@playwright/test";

import { ROLES } from "../support/roles";
import { largeJpeg, largePdf } from "../support/actions";
import { createAsset, listCoverObjects, readAssetCover, readAssetDocuments } from "../support/seed";

/**
 * Admin uploads past the platform's request-body limit. Vercel refuses Function bodies over 4.5 MB before the app runs
 * (locally `bodySizeLimit` is 4 MB to match), so hosted documents and cover images upload straight to storage through
 * signed upload URLs minted with the admin's own session, and the save verifies the stored object before any row
 * references it (lib/storage/direct-upload.ts). Disposable org-A assets throughout.
 */
test.use({ storageState: ROLES.admin.storageState });

const SAVE_TIMEOUT_MS = 60_000;

async function saveCover(page: Page, assetId: string, file: Awaited<ReturnType<typeof largeJpeg>>) {
  await page.goto(`/dashboard/assets/${assetId}`);
  // Use the form that holds the cover image input. The file input's own accessible name ends "…when you click Save
  // changes", so the submit button is matched exactly.
  const assetForm = page.locator("form", { has: page.locator('input[name="file"]') });
  await assetForm.locator('input[name="file"]').setInputFiles(file);
  await assetForm.getByRole("button", { name: "Save changes", exact: true }).click();
}

test("a 12 MB PDF becomes a hosted document @critical", async ({ page }) => {
  const { assetId } = await createAsset();
  const title = `Operator manual ${assetId.slice(0, 8)}`;
  await page.goto(`/dashboard/assets/${assetId}/documents`);

  await page.getByLabel("Title").fill(title);
  await page.locator('input[name="file"]').setInputFiles(largePdf("manual.pdf", 12_000_000));
  await page.getByRole("button", { name: "Add document" }).click();

  await expect.poll(async () => (await readAssetDocuments(assetId)).length, { timeout: SAVE_TIMEOUT_MS }).toBe(1);
  const [document] = await readAssetDocuments(assetId);
  expect(document.title).toBe(title);
  expect(document.storage_path).toMatch(
    new RegExp(`^org/[0-9a-f-]{36}/asset/${assetId}/documents/([0-9a-f-]{36})/\\1\\.pdf$`)
  );
  // The row lands before the save's redirect has re-rendered the list; wait for the page itself.
  await expect(page.getByText(title)).toBeVisible({ timeout: SAVE_TIMEOUT_MS });
});

test("a 4.8 MB cover image saves, and a replacement removes the previous one @critical", async ({ page }) => {
  const { assetId } = await createAsset();
  const coverUrl = new RegExp(`/storage/v1/object/public/public-assets/org/[0-9a-f-]{36}/asset/${assetId}/cover/[0-9a-f-]{36}\\.jpg$`);

  await saveCover(page, assetId, await largeJpeg("cover.jpg", 4_800_000));
  await expect.poll(() => readAssetCover(assetId), { timeout: SAVE_TIMEOUT_MS }).toMatch(coverUrl);
  const first = await readAssetCover(assetId);
  expect(await listCoverObjects(assetId)).toHaveLength(1);

  await saveCover(page, assetId, await largeJpeg("cover-2.jpg", 4_700_000));
  await expect
    .poll(async () => {
      const current = await readAssetCover(assetId);
      return current !== first && coverUrl.test(current ?? "");
    }, { timeout: SAVE_TIMEOUT_MS })
    .toBe(true);
  await expect.poll(async () => (await listCoverObjects(assetId)).length, { timeout: SAVE_TIMEOUT_MS }).toBe(1);
});

test("a refused upload keeps the document form and what was entered", async ({ page }) => {
  const { assetId } = await createAsset();
  await page.goto(`/dashboard/assets/${assetId}/documents`);
  await page.getByLabel("Title").fill("Kept title");
  await page.locator('input[name="file"]').setInputFiles(largePdf("manual.pdf", 1_000_000));

  // The prepare step is a server action POST to this page; refuse it the way the platform would.
  await page.route(`**/dashboard/assets/${assetId}/documents`, async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      await route.fulfill({ status: 413, contentType: "text/plain; charset=utf-8", body: "" });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Add document" }).click();

  await expect(page.getByText("We couldn't upload the file.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Kept title");
  expect(await readAssetDocuments(assetId)).toHaveLength(0);
});
