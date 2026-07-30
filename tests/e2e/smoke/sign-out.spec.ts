import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";

// Smoke 6 — sign out from an authenticated shell returns to /login.
test.describe("sign out", () => {
  test.use({ storageState: ROLES.admin.storageState });

  test("clears the session and returns to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: "Account menu" });
    await expect(trigger).toBeVisible();
    const signOut = page.getByRole("menuitem", { name: "Sign out" });
    // The account menu is a hydrated Radix dropdown; open it with the keyboard (deterministic) and retry
    // until hydrated, then activate the item.
    await expect(async () => {
      await trigger.press("Enter");
      await expect(signOut).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await signOut.click();
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });
});
