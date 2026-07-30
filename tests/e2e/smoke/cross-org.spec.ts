import { test, expect } from "@playwright/test";

import { ASSET } from "../../security/setup/fixtures";
import { ROLES } from "../support/roles";

// Smoke 5 — cross-org browser denial. A SECOND-ORG admin (org B) opening an org-A asset detail URL must
// not see org-A data: RLS returns nothing, so the app renders a not-found state, never the asset.
test.describe("cross-org isolation", () => {
  test.use({ storageState: ROLES.second_org.storageState });

  test("second-org admin cannot open a first-org asset URL", async ({ page }) => {
    await page.goto(`/dashboard/assets/${ASSET.A_PUBLIC}`);
    // Org-A's asset code / name must never appear for an org-B user.
    await expect(page.getByText("A-PUB")).toHaveCount(0);
    await expect(page.getByText("A Public")).toHaveCount(0);
    // And the edit form for that asset is not present (no leaked controls).
    await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0);
  });
});
