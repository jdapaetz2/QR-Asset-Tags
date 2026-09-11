import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";
import { ORG_A, serviceClient } from "../../security/setup/fixtures";

/**
 * Engineering Phase D3A — the customer admin's notification routing settings (org A). Server-side validation keeps
 * the urgent route from being switched on without an address, and a valid save persists the urgent route, the
 * explicit return mode and the photo-preview switch. The original values are restored afterwards.
 */
test.use({ storageState: ROLES.admin.storageState });

const COLUMNS =
  "notification_email, notify_damage_reports, notify_support_requests, notify_tag_request_updates, notify_return_checklists, notify_urgent_reports, urgent_notification_email, return_notification_mode, notify_include_photo_previews";

let original: Record<string, unknown> | null = null;

async function readSettings(): Promise<Record<string, unknown>> {
  const { data, error } = await serviceClient().from("organizations").select(COLUMNS).eq("id", ORG_A).single();
  if (error) throw new Error(`read org A settings: ${error.message}`);
  return data as Record<string, unknown>;
}

test.beforeAll(async () => {
  original = await readSettings();
});

test.afterAll(async () => {
  if (original) await serviceClient().from("organizations").update(original).eq("id", ORG_A);
});

test("the urgent route cannot be switched on without an address", async ({ page }) => {
  await page.goto("/dashboard/settings#notifications");
  const urgent = page.getByRole("checkbox", { name: /Send immediate-attention reports/ });
  await urgent.check();
  await page.getByLabel("Urgent notification email").fill("");
  await page.getByRole("button", { name: "Save notifications" }).click();

  await expect(page.getByText("Add an urgent notification email to turn on urgent notifications.")).toBeVisible();
  // The admin's change is kept on the page, and nothing was saved.
  await expect(urgent).toBeChecked();
  expect((await readSettings()).notify_urgent_reports).toBe(original?.notify_urgent_reports);
});

test("a valid save persists the urgent route, return mode and preview switch @critical", async ({ page }) => {
  await page.goto("/dashboard/settings#notifications");
  // The default address field's accessible name includes its hint, and "Urgent notification email" also contains
  // "notification email", so address it by its form name.
  await page.locator('input[name="notification_email"]').fill("ops@orga.e2e.test");
  await page.getByRole("checkbox", { name: /Send immediate-attention reports/ }).check();
  // The same address may serve both routes.
  await page.getByLabel("Urgent notification email").fill("OPS@orga.e2e.test");
  await page.getByRole("radio", { name: /Daily exceptions summary/ }).check();
  await page.getByRole("checkbox", { name: /Include photo previews/ }).uncheck();
  await page.getByRole("button", { name: "Save notifications" }).click();

  await expect
    .poll(async () => (await readSettings()).return_notification_mode, { timeout: 10_000 })
    .toBe("daily_exceptions");
  expect(await readSettings()).toMatchObject({
    notification_email: "ops@orga.e2e.test",
    notify_urgent_reports: true,
    urgent_notification_email: "OPS@orga.e2e.test",
    notify_include_photo_previews: false,
    // The legacy boolean mirrors the authoritative mode.
    notify_return_checklists: false,
  });

  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Send immediate-attention reports/ })).toBeChecked();
  await expect(page.getByLabel("Urgent notification email")).toHaveValue("OPS@orga.e2e.test");
  await expect(page.getByRole("radio", { name: /Daily exceptions summary/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Include photo previews/ })).not.toBeChecked();
  await expect(page.getByText(/Staff return exceptions are only ever included in the daily summary/)).toBeVisible();
});
