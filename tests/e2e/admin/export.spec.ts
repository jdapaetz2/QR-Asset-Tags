import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";

/**
 * Part B — customer export access boundary. Org A has customer exports DISABLED (redirect + denied
 * download); org B has them ENABLED (page + a real CSV). Uses the two seeded admin storage states.
 */

test.describe("org A — exports disabled", () => {
  test.use({ storageState: ROLES.admin.storageState });

  test("the export page redirects to settings @critical", async ({ page }) => {
    await page.goto("/dashboard/export");
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
  });

  test("the download route is denied", async ({ page }) => {
    const res = await page.request.get("/dashboard/export/download?type=assets", { maxRedirects: 0 });
    // Not a 200 CSV — either a redirect away or a 4xx; never an assets CSV body.
    expect(res.status()).not.toBe(200);
  });
});

test.describe("org B — exports enabled", () => {
  test.use({ storageState: ROLES.second_org.storageState });

  test("the export page offers a download and returns a CSV @critical", async ({ page }) => {
    await page.goto("/dashboard/export");
    await expect(page.getByRole("heading", { name: "Export organization data" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" }).first()).toBeVisible();

    const res = await page.request.get("/dashboard/export/download?type=assets");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("csv");
    expect(await res.text()).toContain("B-PUB");
  });
});
