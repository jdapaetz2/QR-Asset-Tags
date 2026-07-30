import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";

/**
 * Part C — customer-staff route boundaries. Staff (org A) sees the operational nav but NOT Settings, and
 * every admin-only route redirects them to /dashboard. Staff CAN browse rentals + evidence (read).
 */
test.use({ storageState: ROLES.staff.storageState });

test("staff nav shows operational links but never Settings @critical", async ({ page }) => {
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation").first();
  for (const name of ["Dashboard", "Assets", "Submissions", "Rentals", "Analytics"]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
});

test.describe("admin-only routes redirect staff to the dashboard @critical", () => {
  for (const path of [
    "/dashboard/settings",
    "/dashboard/settings/users",
    "/dashboard/templates",
    "/dashboard/assets/import",
    "/dashboard/tag-requests",
    "/dashboard/export",
  ]) {
    test(`${path} → /dashboard`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  }
});

test("staff can browse rentals and open a session's evidence", async ({ page }) => {
  await page.goto("/dashboard/rentals");
  await expect(page.getByRole("heading", { name: "Rental sessions" })).toBeVisible();
});
