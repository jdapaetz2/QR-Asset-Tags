import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";

/**
 * Part B — customer-admin dashboard + asset list (org A). Verifies the shell settles (no refresh loop),
 * active-nav marking, and the asset search/filter → detail round-trip with a preserved returnTo.
 */
test.use({ storageState: ROLES.admin.storageState });

test("dashboard renders and marks the active nav @critical", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Captured so far" })).toBeVisible();
  const dash = page.getByRole("navigation").first().getByRole("link", { name: "Dashboard" });
  await expect(dash).toHaveAttribute("aria-current", "page");
});

test("asset search finds a seeded asset and opens it with returnTo @critical", async ({ page }) => {
  await page.goto("/dashboard/assets");
  await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();

  await page.getByRole("textbox", { name: "Search assets" }).fill("A-PUB");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("cell", { name: "A-PUB" })).toBeVisible();

  await page.getByRole("link", { name: "View / edit" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/assets\/[0-9a-f-]+\?returnTo=/);
});

test("the Filters panel applies a visibility filter", async ({ page }) => {
  await page.goto("/dashboard/assets");
  // Force the Filters <details> open (native details; avoids summary-click races), then apply a filter.
  await page.locator("details:has(select[name='status'])").evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await page.selectOption("select[name='status']", "public");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/status=public/);
});
