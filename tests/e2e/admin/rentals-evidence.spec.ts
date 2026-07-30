import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";
import { EVIDENCE, EVIDENCE_RNT } from "../support/seed";

/**
 * Part B — the rental-session evidence record (org A). The seeded rich session (outbound + renter + staff
 * inspections + an acknowledgement) drives the five evidence disclosures, the print control, and the
 * acknowledgements panel. Also verifies the RNT-reference search reaches it.
 */
test.use({ storageState: ROLES.admin.storageState });

test("evidence record shows all disclosures, print, and acknowledgements @critical", async ({ page }) => {
  await page.goto(`/dashboard/rentals/${EVIDENCE.sessionId}`);
  await expect(page.getByRole("heading", { name: "Rental session condition" })).toBeVisible();

  const sections = page.locator("details[data-evidence-section] > summary");
  for (const title of [
    "Differences",
    "Outbound baseline",
    "Renter return checklist",
    "Staff return checklist",
    "Photos by source",
  ]) {
    await expect(sections.filter({ hasText: title }).first()).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Print evidence" })).toBeVisible();
  await expect(page.getByText("Renter acknowledgement")).toBeVisible();
});

test("RNT-reference search opens the session", async ({ page }) => {
  await page.goto("/dashboard/rentals");
  const summary = page.locator("summary").filter({ hasText: "History tools" }).first();
  if (await summary.isVisible()) await summary.click();
  await page.getByRole("searchbox", { name: "Session reference" }).fill(EVIDENCE_RNT);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: "View session evidence →" }).first()).toBeVisible();
});
