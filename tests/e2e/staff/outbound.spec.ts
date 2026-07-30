import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";
import {
  createAvailableStaffAsset,
  createRentedStaffAsset,
  createRentedWithBaseline,
  readAssetActiveSession,
  readSessionStartedAt,
  countSubmissions,
} from "../support/seed";
import { answerConditionStage } from "../support/actions";

/**
 * Part C — staff outbound inspection, the three session states (create / attach / blocked). Each runs on a
 * disposable asset and verifies the DB effect via a service-role read, not just the UI copy.
 */
test.use({ storageState: ROLES.staff.storageState });

async function completeOutbound(page: import("@playwright/test").Page, submitName: string) {
  await answerConditionStage(page, { damage: false });
  await page.getByRole("button", { name: "Continue" }).click();
  // Attestation is on the outbound-details stage and is required — check it BEFORE advancing to Review.
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review outbound inspection" }).click();
  await page.getByRole("button", { name: submitName }).click();
  // Both the no-photo omission dialog paths funnel through "Submit without photos".
  const dialog = page.locator("dialog[open]");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Submit without photos" }).click();
  }
}

test("available asset: outbound creates an active rental session @critical", async ({ page }) => {
  const { assetId, shortCode } = await createAvailableStaffAsset();
  await page.goto(`/staff/t/${shortCode}`);
  await expect(page.getByRole("link", { name: "Start outbound inspection" })).toBeVisible();

  await page.goto(`/staff/t/${shortCode}/outbound`);
  await completeOutbound(page, "Complete inspection & mark rented");
  await page.waitForURL(new RegExp(`/staff/t/${shortCode}(\\?|$)`));

  expect(await readAssetActiveSession(assetId)).not.toBeNull();
  expect(await countSubmissions(assetId, "pre_use_inspection")).toBe(1);
});

test("rented asset without a baseline: outbound attaches to the same session", async ({ page }) => {
  const { assetId, shortCode, sessionId, startedAt } = await createRentedStaffAsset();
  await page.goto(`/staff/t/${shortCode}`);
  await expect(page.getByRole("link", { name: "Add outbound inspection" })).toBeVisible();

  await page.goto(`/staff/t/${shortCode}/outbound`);
  // Attach-mode confirmation gate first.
  await page.getByRole("button", { name: "Continue with this rental session" }).click();
  await completeOutbound(page, "Complete outbound inspection");
  // Wait for the post-submit redirect back to the staff asset before reading the DB.
  await page.waitForURL(new RegExp(`/staff/t/${shortCode}(\\?|$)`));

  // Same session preserved (pointer unchanged, started_at unchanged); a baseline now exists.
  expect(await readAssetActiveSession(assetId)).toBe(sessionId);
  // Compare as instants — Postgres returns timestamptz as "…+00:00", not the seeded "…Z".
  expect(new Date((await readSessionStartedAt(sessionId))!).getTime()).toBe(new Date(startedAt).getTime());
  expect(await countSubmissions(assetId, "pre_use_inspection")).toBe(1);
});

test("rented asset with a baseline: outbound is blocked @critical", async ({ page }) => {
  const { shortCode } = await createRentedWithBaseline();
  await page.goto(`/staff/t/${shortCode}/outbound`);
  await expect(
    page.getByText("An outbound inspection is already recorded for this rental session.")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View outbound inspection" })).toBeVisible();
  // No submit form in the blocked state.
  await expect(page.getByRole("button", { name: /mark rented|outbound inspection$/i })).toHaveCount(0);
});
