import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";

/**
 * Part B — settings reachability + brand/terminology. Confirms the admin can reach team management and
 * that the product wordmark + the standardized "Return checklist" terminology are present.
 */
test.use({ storageState: ROLES.admin.storageState });

test("settings and team management are reachable @critical", async ({ page }) => {
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("link", { name: "Manage team" }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/users$/);
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
});

test("the product wordmark is present on the shell", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Mulemark home" })).toBeVisible();
});

test("standardized 'Return checklist' terminology on a public return", async ({ page }) => {
  await page.goto("/forms/a3-a-pub/return");
  await expect(page.getByRole("heading", { name: "Return checklist" })).toBeVisible();
});
