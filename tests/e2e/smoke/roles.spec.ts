import { test, expect } from "@playwright/test";

import { E2E_PASSWORD, ROLES } from "../support/roles";

// Smoke 2/3/4 — role landings. The admin case does a FRESH UI login (exercising the login path directly,
// separate from the storage-state fixtures); staff and owner reuse their saved storage state.

test.describe("customer admin", () => {
  test("logs in and sees the Dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ROLES.admin.email);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();
  });
});

test.describe("customer staff", () => {
  test.use({ storageState: ROLES.staff.storageState });
  test("sees the operational nav on the Dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    // Staff keeps operational surfaces (Assets + Submissions); the shell renders their nav links.
    await expect(page.getByRole("link", { name: "Assets" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Submissions" }).first()).toBeVisible();
  });
});

test.describe("platform owner", () => {
  test.use({ storageState: ROLES.owner.storageState });
  test("sees Organizations on the owner console", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).toHaveURL(/\/owner$/);
    await expect(page.getByRole("link", { name: "Organizations" }).first()).toBeVisible();
  });
});
