import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";
import { ORG_A } from "../../security/setup/fixtures";

/**
 * Part D — platform owner org list, org subnav, and the always-available owner export.
 */
test.use({ storageState: ROLES.owner.storageState });

test("owner sees the org list and can open an org's sections @critical", async ({ page }) => {
  await page.goto("/owner");
  await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Org A" })).toBeVisible();

  await page.goto(`/owner/organizations/${ORG_A}`);
  const subnav = page.getByRole("navigation", { name: "Organization sections" });
  for (const name of ["Overview", "QR codes", "Users", "Export", "Settings"]) {
    await expect(subnav.getByRole("link", { name })).toBeVisible();
  }
});

test("the owner data export always returns a CSV @critical", async ({ page }) => {
  const res = await page.request.get(`/owner/organizations/${ORG_A}/export/download?type=assets`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("csv");
  expect(await res.text()).toContain("A-PUB");
});

test("the org settings tab exposes the customer-export toggle", async ({ page }) => {
  await page.goto(`/owner/organizations/${ORG_A}/settings`);
  await expect(
    page.getByRole("checkbox", { name: "Enable customer exports (master switch)" })
  ).toBeVisible();
});
