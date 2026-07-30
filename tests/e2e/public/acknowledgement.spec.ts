import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";

/**
 * Part A — the once-per-rental acknowledgement prompt (anon, ~390px). It appears after a short delay on an
 * asset with an active rental session, is transient on Dismiss, is suppressed for the session after being
 * completed, and is NEVER shown to authorized same-org staff (server-gated). Uses `a3-a-pub`, which has an
 * active seeded rental session.
 */
test.use({ viewport: { width: 390, height: 844 } });

const promptFor = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog", { name: "Before you use this equipment" });

test("anon sees the prompt after the delay; completing suppresses it on reload @critical", async ({ page }) => {
  await page.goto("/t/a3-a-pub");
  const prompt = promptFor(page);
  await expect(prompt).toBeVisible({ timeout: 8000 });

  await prompt.getByLabel("Your name").fill("Renter Rita");
  await prompt.getByRole("checkbox").check();
  await prompt.getByRole("button", { name: "Acknowledge" }).click();
  // On success the prompt persists the suppression key and hides itself.
  await expect(prompt).toHaveCount(0);

  // localStorage suppression → the prompt does not return on reload for this session/device.
  await page.reload();
  await page.waitForTimeout(5000);
  await expect(promptFor(page)).toHaveCount(0);
});

test("dismissing is transient — the prompt returns on the next load", async ({ page }) => {
  await page.goto("/t/a3-a-pub");
  const prompt = promptFor(page);
  await expect(prompt).toBeVisible({ timeout: 8000 });
  await prompt.getByRole("button", { name: "Dismiss for now" }).click();
  await expect(prompt).toHaveCount(0);

  await page.reload();
  await expect(promptFor(page)).toBeVisible({ timeout: 8000 });
});

test.describe("authorized same-org staff never see the renter prompt", () => {
  test.use({ storageState: ROLES.staff.storageState });
  test("staff viewer sees no acknowledgement prompt @critical", async ({ page }) => {
    await page.goto("/t/a3-a-pub");
    await expect(page.getByRole("link", { name: "Open staff workflow" })).toBeVisible();
    await page.waitForTimeout(5000);
    await expect(promptFor(page)).toHaveCount(0);
  });
});
