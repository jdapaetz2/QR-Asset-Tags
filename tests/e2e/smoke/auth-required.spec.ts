import { test, expect } from "@playwright/test";

// Part D — invalid/absent auth is handled cleanly: an unauthenticated visit to a protected route
// redirects to /login (no crash, no leaked shell). This spec deliberately uses NO storage state.
test.describe("auth required", () => {
  test("unauthenticated dashboard access redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
