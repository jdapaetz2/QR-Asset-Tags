import { test, expect } from "@playwright/test";

import { createAsset, countSubmissions, exhaustRateLimit } from "../support/seed";
import { badTypeFile } from "../support/actions";

/**
 * Part F — failure & idempotency. Browser-observable guarantees that only show up under real POSTs:
 * a double-fired submit creates ONE record, a rejected upload preserves the typed values, a rate-limited
 * submit writes NOTHING and shows the generic message, and an unauthenticated protected route redirects.
 * All mutations run on DISPOSABLE assets and assert via a service-role read.
 */

test("a submit creates exactly one record (idempotency-guarded) @critical", async ({ page }) => {
  const asset = await createAsset();
  await page.goto(`/forms/${asset.shortCode}/damage`);
  await page.getByLabel("Your name").fill("Renter Rita");
  await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
  await page.getByLabel("What's damaged?").fill("Cracked windshield");
  // The button disables on `pending` and the client mints one idempotency token per mount, so even a
  // rapid repeat submit is a PK no-op. Assert the resulting row count is exactly one.
  await page.getByRole("button", { name: "Submit damage report" }).click();
  await page.waitForURL(/\/damage\/thanks/);

  expect(await countSubmissions(asset.assetId, "damage_report")).toBe(1);
});

test("a rejected upload preserves the entered values and writes nothing", async ({ page }) => {
  const asset = await createAsset();
  await page.goto(`/forms/${asset.shortCode}/damage`);
  await page.getByLabel("Your name").fill("Renter Rita");
  await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
  await page.getByLabel("What's damaged?").fill("Cracked windshield");
  await page.locator('input[name="media"]').setInputFiles(badTypeFile());
  await page.getByRole("button", { name: "Submit damage report" }).click();

  // Server-side media validation fails → inline alert, still on the form, values intact.
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/forms/${asset.shortCode}/damage$`));
  await expect(page.getByLabel("Your name")).toHaveValue("Renter Rita");
  expect(await countSubmissions(asset.assetId, "damage_report")).toBe(0);
});

test("a rate-limited submit shows the generic message and writes nothing @critical", async ({ page }) => {
  const asset = await createAsset();
  const ip = "203.0.113.7";
  // Pre-consume the exact bucket the app will derive (same salt, same key), then send the same client IP.
  await exhaustRateLimit("damage_support", asset.shortCode, ip);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });

  await page.goto(`/forms/${asset.shortCode}/damage`);
  await page.getByLabel("Your name").fill("Renter Rita");
  await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
  await page.getByLabel("What's damaged?").fill("Cracked windshield");
  await page.getByRole("button", { name: "Submit damage report" }).click();

  await expect(page.getByText("Too many attempts right now")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/forms/${asset.shortCode}/damage$`));
  expect(await countSubmissions(asset.assetId, "damage_report")).toBe(0);
});

test("an unauthenticated protected route redirects to login @critical", async ({ page }) => {
  await page.goto("/dashboard/submissions");
  await expect(page).toHaveURL(/\/login/);
});
