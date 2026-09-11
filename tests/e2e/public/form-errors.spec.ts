import { test, expect, type Page } from "@playwright/test";

import { answerConditionStage, tinyPng } from "../support/actions";
import { countSubmissions, createAsset, exhaustRateLimit } from "../support/seed";

/**
 * A server-side error must not wipe what the renter typed. React resets a `<form action>` after the action
 * completes — even one that returned an error — so the public forms dispatch their action from `onSubmit` instead.
 * Each test waits for the server's own error text before checking values, so the check runs after the response.
 * Disposable assets throughout; mobile viewport, like the renter at the machine.
 */
test.use({ viewport: { width: 390, height: 844 } });

function mediaFileCount(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((element) => (element as HTMLInputElement).files?.length ?? 0);
}

test("damage form keeps typed values, answers and photos after a server error @critical", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/damage`);
  await page.getByLabel("Your name").fill("Renter Rita");
  await page
    .getByRole("group", { name: /Can the equipment be used\?/ })
    .getByText("Yes, but not properly", { exact: true })
    .click();
  await page.getByLabel("What's damaged?").fill("Bent loader arm");
  await page.locator('input[name="media"]').setInputFiles(tinyPng());
  // No email or phone → the server refuses.
  await page.getByRole("button", { name: "Submit damage report" }).click();

  await expect(page.getByText("Provide an email or a phone number.")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Renter Rita");
  await expect(page.getByLabel("What's damaged?")).toHaveValue("Bent loader arm");
  await expect(page.locator('input[type="radio"][value="operating_with_limitations"]')).toBeChecked();
  expect(await mediaFileCount(page, 'input[name="media"]')).toBe(1);
  expect(await countSubmissions(assetId, "damage_report")).toBe(0);

  // Correct the error on the same page: it still submits, exactly once.
  await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
  await page.getByRole("button", { name: "Submit damage report" }).click();
  await page.waitForURL(/\/damage\/thanks\?ref=SUB-/);
  expect(await countSubmissions(assetId, "damage_report")).toBe(1);
});

test("support form keeps typed values and the chosen contact method after a server error", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/support`);
  await page.getByLabel("Your name").fill("Renter Rita");
  await page
    .getByRole("group", { name: /What do you need help with\?/ })
    .getByText("It broke down or won't start", { exact: true })
    .click();
  await page.getByLabel("Preferred contact method").selectOption("text");
  await page.getByLabel("Describe the problem").fill("Engine cranks but will not start");
  await page.getByRole("button", { name: "Send support request" }).click();

  await expect(page.getByText("Provide an email or a phone number.")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Renter Rita");
  await expect(page.getByLabel("Preferred contact method")).toHaveValue("text");
  await expect(page.getByLabel("Describe the problem")).toHaveValue("Engine cranks but will not start");
  await expect(page.locator('input[type="radio"][value="breakdown_no_start"]')).toBeChecked();
  expect(await countSubmissions(assetId, "support_request")).toBe(0);
});

test("return checklist keeps contact details and answers after a server error", async ({ page }) => {
  const { assetId, shortCode } = await createAsset();
  const ip = "203.0.113.41";
  // Pre-consume the exact bucket the app derives, then send the same client IP → a server-side rate-limit error.
  await exhaustRateLimit("return", shortCode, ip);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });

  await page.goto(`/forms/${shortCode}/return`);
  await answerConditionStage(page, { damage: false });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 2 of 3 · Return details")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review return checklist" }).click();
  await expect(page.getByText("Step 3 of 3 · Review & submit")).toBeVisible();

  await page.getByLabel("Your name").fill("Renter Rita");
  await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
  await page.getByRole("textbox", { name: "Phone" }).fill("604-555-0142");
  await page.getByRole("button", { name: "Submit return checklist" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Submit without photos" }).click();

  await expect(page.getByText("Too many attempts right now")).toBeVisible();
  await expect(page.getByText("Step 3 of 3 · Review & submit")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Renter Rita");
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("rita@example.test");
  await expect(page.getByRole("textbox", { name: "Phone" })).toHaveValue("604-555-0142");
  await expect(page.locator('#field-tires_wheels input[type="radio"][value="pass"]')).toBeChecked();
  expect(await countSubmissions(assetId, "return_checklist")).toBe(0);
});
