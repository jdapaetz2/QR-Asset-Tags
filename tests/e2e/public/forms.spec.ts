import { test, expect } from "@playwright/test";

import { submitDamage, tinyPng, expectNoHorizontalOverflow } from "../support/actions";

/**
 * Part A — public damage + support forms (anon, ~390px). The renter's write path: required-field guarding,
 * optional media, and a quotable reference on success. Uses the baseline public asset `a3-a-pub`.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SUB_REF = /^SUB-\d{4}-[0-9A-F]{6}$/;

test.describe("public damage form", () => {
  test("blocks an empty submit and keeps the entered values @critical", async ({ page }) => {
    await page.goto("/forms/a3-a-pub/damage");
    await page.getByLabel("Your name").fill("Renter Rita");
    // Description left empty → native required blocks submit; we never leave the form.
    await page.getByRole("button", { name: "Submit damage report" }).click();
    await expect(page).toHaveURL(/\/forms\/a3-a-pub\/damage$/);
    await expect(page.getByLabel("What's damaged?")).toHaveJSProperty("validity.valueMissing", true);
    // The value the renter did type is preserved.
    await expect(page.getByLabel("Your name")).toHaveValue("Renter Rita");
    await expectNoHorizontalOverflow(page);
  });

  test("submits successfully and shows a reference @critical", async ({ page }) => {
    await submitDamage(page, "a3-a-pub", { description: "Cracked windshield" });
    await page.waitForURL(/\/forms\/a3-a-pub\/damage\/thanks/);
    await expect(page.getByRole("heading", { name: /^Sent to/ })).toBeVisible();
    await expect(page.getByText(SUB_REF)).toBeVisible();
    await expect(page.getByRole("link", { name: "Return to equipment page" })).toBeVisible();
  });

  test("accepts an optional photo", async ({ page }) => {
    await submitDamage(page, "a3-a-pub", { description: "Dented panel", file: tinyPng() });
    await page.waitForURL(/\/damage\/thanks/);
    await expect(page.getByRole("heading", { name: /^Sent to/ })).toBeVisible();
  });
});

test.describe("public support form", () => {
  test("submits a support request and shows a reference", async ({ page }) => {
    await page.goto("/forms/a3-a-pub/support");
    await page.getByLabel("Your name").fill("Renter Rita");
    // Support requires a contact method (email or phone).
    await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
    await page.getByLabel("What do you need help with?").fill("How do I fold the ramps?");
    await page.getByRole("button", { name: "Send support request" }).click();
    await page.waitForURL(/\/forms\/a3-a-pub\/support\/thanks/);
    await expect(page.getByRole("heading", { name: /^Sent to/ })).toBeVisible();
    await expect(page.getByText(SUB_REF)).toBeVisible();
  });
});
