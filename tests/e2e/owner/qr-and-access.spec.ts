import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";
import { ORG_A } from "../../security/setup/fixtures";
import { createAsset } from "../support/seed";

/**
 * Part D — owner QR governance (create a code alias on a disposable asset) + platform access control
 * (a customer is bounced off /owner; the owner reaches the tag-request queue).
 */

test.describe("owner QR governance", () => {
  test.use({ storageState: ROLES.owner.storageState });

  test("owner can create a QR code alias for an asset @critical", async ({ page }) => {
    const { assetId } = await createAsset();
    await page.goto(`/owner/organizations/${ORG_A}/qr`);

    // Each asset's create form is uniquely identified by its input id (`code-<assetId>`).
    const input = page.locator(`#code-${assetId}`);
    await expect(input).toBeVisible();
    const alias = `e2e-alias-${assetId.slice(0, 6)}`;
    await input.fill(alias);
    await page.locator(`form:has(#code-${assetId})`).getByRole("button", { name: /^Create code$/ }).click();

    await expect(page.getByText(alias)).toBeVisible();
  });

  test("owner reaches the tag-request queue", async ({ page }) => {
    await page.goto("/owner/tag-requests");
    await expect(page.getByRole("heading", { name: "Tag requests" })).toBeVisible();
  });
});

test.describe("platform access control", () => {
  test.use({ storageState: ROLES.staff.storageState });

  test("staff hitting /owner is redirected to the dashboard @critical", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
