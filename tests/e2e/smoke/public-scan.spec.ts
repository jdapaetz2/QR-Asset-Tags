import { test, expect } from "@playwright/test";

// Smoke 1 — the public mobile scan page loads for the anon visitor (no auth, no crash).
test.describe("public scan page", () => {
  test("loads the equipment page for an active QR / public asset", async ({ page }) => {
    const response = await page.goto("/t/a3-a-pub");
    expect(response?.ok(), "the scan route should return 2xx").toBeTruthy();
    // The seeded public asset's name is rendered on the page.
    await expect(page.getByText("A Public").first()).toBeVisible();
  });
});
