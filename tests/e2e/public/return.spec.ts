import { test, expect } from "@playwright/test";

import { createAsset } from "../support/seed";
import { answerConditionStage } from "../support/actions";

/**
 * Part A — guided return checklist (anon, ~390px). The most stateful renter surface: a 3-stage wizard
 * whose answers must survive Back, whose photos never block, and whose damage-without-photo path routes
 * through the omission dialog. Runs on a DISPOSABLE utility_trailer asset so it never disturbs the baseline.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SUB_REF = /^SUB-\d{4}-[0-9A-F]{6}$/;

test("guided return: 3 stages, no-photo omission dialog, success @critical", async ({ page }) => {
  const { shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/return`);

  await expect(page.getByText("Step 1 of 3 · Condition")).toBeVisible();
  await answerConditionStage(page, { damage: false });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Step 2 of 3 · Return details")).toBeVisible();
  await page.getByRole("checkbox").check(); // the required attestation
  await page.getByRole("button", { name: "Review return checklist" }).click();

  await expect(page.getByText("Step 3 of 3 · Review & submit")).toBeVisible();
  await page.getByRole("button", { name: "Submit return checklist" }).click();

  // No photos were added → one consolidated omission dialog, not a hard block.
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Submit without photos" }).click();

  await page.waitForURL(/\/return\/thanks/);
  await expect(page.getByRole("heading", { name: /^Sent to/ })).toBeVisible();
  await expect(page.getByText(SUB_REF)).toBeVisible();
});

test("answers survive Back navigation", async ({ page }) => {
  const { shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/return`);

  await answerConditionStage(page, { damage: false });
  // First condition choice (Tires / wheels) is now "pass".
  await expect(page.locator('#field-tires_wheels input[type="radio"][value="pass"]')).toBeChecked();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 2 of 3 · Return details")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.getByText("Step 1 of 3 · Condition")).toBeVisible();
  await expect(page.locator('#field-tires_wheels input[type="radio"][value="pass"]')).toBeChecked();
});

test("damage without a photo routes through the omission dialog", async ({ page }) => {
  const { shortCode } = await createAsset();
  await page.goto(`/forms/${shortCode}/return`);

  await answerConditionStage(page, { damage: true });
  await page.getByRole("button", { name: "Continue" }).click();

  // Damage=Yes reveals the Damage-details section (required: location, severity, description).
  await page.locator("#field-damage_location").fill("Left fender");
  await page.locator("#field-damage_severity").getByText("Minor", { exact: true }).click();
  await page.locator("#field-damage_description").fill("Scrape along the panel");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review return checklist" }).click();
  await page.getByRole("button", { name: "Submit return checklist" }).click();

  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  // "Add photos" returns to the details stage (does not submit).
  await dialog.getByRole("button", { name: "Add photos" }).click();
  await expect(page.getByText("Step 2 of 3 · Return details")).toBeVisible();
});
