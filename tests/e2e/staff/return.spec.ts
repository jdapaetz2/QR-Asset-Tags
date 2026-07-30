import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";
import { createRentedStaffAsset, readSessionState } from "../support/seed";
import { answerConditionStage } from "../support/actions";

/**
 * Part C — staff return checklist. Completing it must close the rental and free the asset (verified via a
 * service-role read), and the completion page must say so.
 */
test.use({ storageState: ROLES.staff.storageState });

test("staff return closes the rental and frees the asset @critical", async ({ page }) => {
  const { assetId, shortCode, sessionId } = await createRentedStaffAsset();
  await page.goto(`/staff/t/${shortCode}/return`);

  await expect(page.getByRole("heading", { name: "Staff return checklist" })).toBeVisible();

  await answerConditionStage(page, { damage: false });
  await page.getByRole("button", { name: "Continue" }).click();
  // The staff return records identity via the Review context (no renter-style attestation checkbox).
  await page.getByRole("button", { name: "Review return checklist" }).click();

  // The signed-in staff identity is shown in the Review-step context section.
  await expect(page.getByText("Completed by")).toBeVisible();
  await page.getByRole("button", { name: "Complete return checklist" }).click();

  const dialog = page.locator("dialog[open]");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Submit without photos" }).click();
  }

  await page.waitForURL(/\/return\/complete/);
  await expect(page.getByText("Asset is now available")).toBeVisible();
  await expect(page.getByText("Rental session closed")).toBeVisible();

  const state = await readSessionState(sessionId, assetId);
  expect(state.status).toBe("returned");
  expect(state.activePointer).toBeNull();
});
