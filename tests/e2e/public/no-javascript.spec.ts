import { test, expect } from "@playwright/test";

import { tinyPng } from "../support/actions";
import { createAsset, readLatestSubmissionMedia, readScanEvents } from "../support/seed";

/**
 * The public scan page and forms stream a loading skeleton first and swap the real page in with inline scripts, so
 * without JavaScript the skeleton would never go away. The skeleton sends the browser to `?nojs=1`, which serves a
 * copy of the route that does not stream (lib/public/nojs.ts, app/nojs/). Disposable assets; mobile viewport.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SUB_REF = /^SUB-\d{4}-[0-9A-F]{6}$/;
/** The scan row is written after the response, so give it time to appear before counting. */
const SCAN_APPEARANCE_TIMEOUT_MS = 15_000;
const NOTICE = "[data-return-noscript-notice]";

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("a damage report with a small photo reaches the thanks page @critical", async ({ page }) => {
    const { assetId, shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/damage`);
    await page.waitForURL(`**/forms/${shortCode}/damage?nojs=1`);

    await page.getByLabel("Your name").fill("Renter Rita");
    await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
    await page.getByLabel("What's damaged?").fill("Bent loader arm");
    await page.locator('input[name="media"]').setInputFiles(tinyPng());
    await page.getByRole("button", { name: "Submit damage report" }).click();

    await page.waitForURL(/\/damage\/thanks\?ref=SUB-/);
    await expect(page.getByRole("heading", { name: /^Sent to/ })).toBeVisible();
    await expect(page.getByText(SUB_REF)).toBeVisible();
    const media = await readLatestSubmissionMedia(assetId, "damage_report");
    expect(media).toHaveLength(1);
    expect(media[0]).toMatch(
      new RegExp(`^org/[0-9a-f-]{36}/asset/${assetId}/submission/[0-9a-f-]{36}/[0-9a-f-]{36}\\.png$`)
    );
  });

  test("a support request reaches the thanks page", async ({ page }) => {
    const { shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/support`);
    await page.waitForURL(`**/forms/${shortCode}/support?nojs=1`);

    await page.getByLabel("Your name").fill("Renter Rita");
    await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
    await page.getByLabel("Describe the problem").fill("How do I fold the ramps?");
    await page.getByRole("button", { name: "Send support request" }).click();

    await page.waitForURL(/\/support\/thanks/);
    await expect(page.getByRole("heading", { name: /^Sent to/ })).toBeVisible();
  });

  test("the scan page renders its actions and records exactly one scan @critical", async ({ page }) => {
    const { assetId, shortCode } = await createAsset();
    await page.goto(`/t/${shortCode}`);
    await page.waitForURL(`**/t/${shortCode}?nojs=1`);

    await expect(page.getByRole("heading", { name: `E2E ${shortCode}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Report Damage" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Return checklist" }).first()).toBeVisible();

    // The first (streamed) request records the scan; the no-JavaScript copy must not record a second one.
    await expect
      .poll(async () => (await readScanEvents(assetId)).length, { timeout: SCAN_APPEARANCE_TIMEOUT_MS })
      .toBe(1);
    await page.waitForTimeout(2_000);
    expect(await readScanEvents(assetId)).toHaveLength(1);
  });

  test("the return checklist explains it needs JavaScript and offers only honest next steps", async ({ page }) => {
    const { shortCode } = await createAsset({ supportPhone: "(604) 555-0100" });
    await page.goto(`/forms/${shortCode}/return`);
    await page.waitForURL(`**/forms/${shortCode}/return?nojs=1`);

    // Playwright's text and role engines skip <noscript> subtrees, so the notice is located by its marker. A real
    // browser without JavaScript renders it as ordinary content.
    const notice = page.locator(NOTICE);
    await expect(notice).toBeVisible();
    await expect(notice.locator('[data-noscript-action="back"]')).toHaveAttribute("href", `/t/${shortCode}`);
    await expect(notice.locator('[data-noscript-action="call"]')).toHaveAttribute("href", "tel:6045550100");
    // A damage report is not a return checklist: the notice never offers it (or any other form) in its place.
    await expect(notice.locator('a[href*="/forms/"]')).toHaveCount(0);
    await expect(page.locator("form[data-requires-javascript]")).toBeHidden();
    // No redirect: the renter stays on the return page they opened.
    await page.waitForTimeout(1_000);
    expect(page.url()).toContain(`/forms/${shortCode}/return`);
  });
});

test.describe("with JavaScript", () => {
  test("the scan page and return checklist stay on their own URLs, with no notice", async ({ page }) => {
    const { shortCode } = await createAsset();

    await page.goto(`/t/${shortCode}`);
    await expect(page.getByRole("heading", { name: `E2E ${shortCode}` })).toBeVisible();
    await page.waitForTimeout(1_000);
    expect(page.url()).not.toContain("nojs");

    await page.goto(`/forms/${shortCode}/return`);
    await expect(page.getByText(/Step 1 of 3/).first()).toBeVisible();
    await page.waitForTimeout(1_000);
    expect(page.url()).not.toContain("nojs");
    // With scripting on, <noscript> content is inert text: no notice element exists and the checklist shows.
    await expect(page.locator(NOTICE)).toHaveCount(0);
    await expect(page.locator("form[data-requires-javascript]")).toBeVisible();
  });
});
