import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";
import { createAsset, createSubmission } from "../support/seed";

/**
 * Part B — the submissions inbox + detail (org A). Status transitions and the bulk toolbar are the
 * workflows that only fully exercise in a browser. Each test seeds its own disposable NEW submission.
 */
test.use({ storageState: ROLES.admin.storageState });

test("resolving a submission from the detail changes its status @critical", async ({ page }) => {
  const asset = await createAsset();
  const id = await createSubmission({ assetId: asset.assetId, formType: "damage_report", status: "new" });

  await page.goto(`/dashboard/submissions/${id}`);
  await expect(page.getByRole("link", { name: "← Submissions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toBeVisible();
  await page.getByRole("button", { name: "Resolve" }).click();

  // After resolving, the "reopen" action for a resolved submission appears.
  await expect(page.getByRole("button", { name: "Reopen as reviewed" })).toBeVisible();
});

test("the inbox quick-filters and bulk toolbar work", async ({ page }) => {
  const asset = await createAsset();
  await createSubmission({ assetId: asset.assetId, formType: "damage_report", status: "new" });

  await page.goto("/dashboard/submissions?status=all_active");
  await expect(page.getByRole("link", { name: "Unresolved" })).toBeVisible();

  const selectAll = page.getByRole("checkbox", { name: "Select all visible submissions" });
  await expect(selectAll).toBeVisible();
  await selectAll.check();
  // Selecting reveals the bulk toolbar (its "N selected" count + Clear selection are unique to it).
  await expect(page.getByText(/\d+ selected/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear selection" })).toBeVisible();
});
