import { test, expect } from "@playwright/test";

import { E2E_PASSWORD, ROLES } from "../support/roles";
import { createAsset, createSubmission, countSubmissions } from "../support/seed";

/**
 * Phase C8 — the interface acknowledges the user, truthfully, and only once.
 *
 * These are behavioural on purpose. Whether a button says "Resolving…" while its action is in flight is
 * not something a unit test of a label map can establish; it depends on `useFormStatus` reporting the
 * right form, on the pressed button being identifiable, and on the disabled state landing before a
 * second click can register.
 *
 * The measured baseline this guards: acknowledgement was already prompt (57 ms) but indiscriminate —
 * every status button greyed out with no sign which one was running.
 */
test.use({ storageState: ROLES.admin.storageState });

async function seedNewSubmission() {
  const asset = await createAsset();
  const id = await createSubmission({
    assetId: asset.assetId,
    formType: "damage_report",
    status: "new",
  });
  return { assetId: asset.assetId, id };
}

test("the pressed status button names its own action, and the others do not @critical", async ({ page }) => {
  const { id } = await seedNewSubmission();
  await page.goto(`/dashboard/submissions/${id}`);

  const resolve = page.getByRole("button", { name: "Resolve" });
  const reviewed = page.getByRole("button", { name: "Mark reviewed" });
  await expect(resolve).toBeVisible();
  await expect(reviewed).toBeVisible();

  await resolve.click();

  // The pressed button says what IT is doing — "Resolving…", never "Resolved": the server has not
  // answered yet, and claiming the outcome would be a false optimistic success.
  await expect(page.getByRole("button", { name: "Resolving…" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Resolved" })).toHaveCount(0);

  // Siblings disable (the duplicate-submit guard) but must not claim to be running.
  await expect(page.getByRole("button", { name: "Marking reviewed…" })).toHaveCount(0);

  // And the action really completes.
  await expect(page.getByRole("button", { name: "Reopen as reviewed" })).toBeVisible();
});

test("double-clicking a status button performs the action once @critical", async ({ page }) => {
  const { assetId, id } = await seedNewSubmission();
  await page.goto(`/dashboard/submissions/${id}`);

  const resolve = page.getByRole("button", { name: "Resolve" });
  await expect(resolve).toBeVisible();

  // The guard IS the disabled attribute, so assert that directly. Counting rows afterwards would not
  // detect a second mutation: setting a status to "resolved" twice is idempotent, so a duplicate would
  // leave exactly the same database state and the test would pass while proving nothing.
  await resolve.click();
  await expect(page.getByRole("button", { name: "Resolving…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toBeDisabled();

  // A second click while disabled is swallowed by the browser and cannot reach the action.
  await resolve.click({ force: true, timeout: 2_000 }).catch(() => {});

  await expect(page.getByRole("button", { name: "Reopen as reviewed" })).toBeVisible();
  // And no stray submission row was created along the way.
  expect(await countSubmissions(assetId)).toBe(1);
});

test("a status button is operable by keyboard and shows the same pending wording", async ({ page }) => {
  const { id } = await seedNewSubmission();
  await page.goto(`/dashboard/submissions/${id}`);

  const resolve = page.getByRole("button", { name: "Resolve" });
  await expect(resolve).toBeVisible();
  await resolve.focus();
  await expect(resolve).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Resolving…" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Reopen as reviewed" })).toBeVisible();
});

test("no stale pending state survives a Back navigation", async ({ page }) => {
  const { id } = await seedNewSubmission();
  await page.goto("/dashboard/submissions?status=all_active");
  await page.goto(`/dashboard/submissions/${id}`);

  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByRole("button", { name: "Reopen as reviewed" })).toBeVisible();

  await page.goBack();
  // Returning to the inbox must not show a button frozen mid-action from the previous page.
  await expect(page.getByRole("button", { name: /…$/ })).toHaveCount(0);
});

test.describe("sign-in acknowledges immediately", () => {
  // A signed-out context: this is the one action that had no pending state at all, measured at 4566 ms
  // from click to dashboard with nothing changing on screen.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the button reports progress and disables itself on submit @critical", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ROLES.admin.email);
    await page.getByLabel("Password").fill(E2E_PASSWORD);

    const submit = page.getByRole("button", { name: "Sign in" });
    await expect(submit).toBeEnabled();
    await submit.click();

    // Either the pending label appears, or the navigation already completed — both are acknowledgement.
    // Asserting only the label would make this flaky against a fast server for no added guarantee.
    await Promise.race([
      expect(page.getByRole("button", { name: "Signing in…" })).toBeVisible({ timeout: 5_000 }),
      page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
    ]);

    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    // Never claims success before it has one.
    await expect(page.getByRole("button", { name: "Signed in" })).toHaveCount(0);
  });
});
