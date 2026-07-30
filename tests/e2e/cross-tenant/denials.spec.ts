import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";
import { ASSET, SUBMISSION, RENTAL } from "../../security/setup/fixtures";

/**
 * Part E — cross-tenant isolation in the browser. A second-org (org B) customer must never see org-A data
 * through any admin URL, an org-B customer is bounced off /owner, and a wrong-org STAFF member gets a 404
 * for an org-A staff short code (RLS makes the row invisible — indistinguishable from unknown).
 *
 * Asserts on the ABSENCE of org-A identifiers (not just hidden nav), so a leak would fail loudly.
 */

test.describe("org-B admin cannot reach org-A records", () => {
  test.use({ storageState: ROLES.second_org.storageState });

  for (const [label, path] of [
    ["asset detail", `/dashboard/assets/${ASSET.A_PUBLIC}`],
    ["submission detail", `/dashboard/submissions/${SUBMISSION.A_RETURN}`],
    ["rental-session evidence", `/dashboard/rentals/${RENTAL.A_ACTIVE}`],
  ] as const) {
    test(`${label} shows no org-A data @critical`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("A-PUB")).toHaveCount(0);
      await expect(page.getByText("A Public")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /save|resolve|mark reviewed/i })).toHaveCount(0);
    });
  }

  test("an org-B asset export never contains org-A rows", async ({ page }) => {
    const res = await page.request.get("/dashboard/export/download?type=assets");
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).not.toContain("A-PUB");
    expect(csv).toContain("B-PUB"); // its own org's data IS present
  });

  test("a customer hitting /owner is redirected to the dashboard @critical", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("wrong-org staff is denied an org-A staff short code", () => {
  test.use({ storageState: ROLES.second_org_staff.storageState });

  test("org-B staff opening an org-A short code gets a 404 @critical", async ({ page }) => {
    const res = await page.goto("/staff/t/a3-a-pub");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("A Public")).toHaveCount(0);
  });
});
