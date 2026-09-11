import { randomUUID } from "node:crypto";

import { test, expect } from "@playwright/test";

import { ROLES } from "../support/roles";
import { ORG_A, serviceClient } from "../../security/setup/fixtures";

/**
 * Migration 0035 — owner-internal tag request fields in the browser. The owner console still shows a new request as
 * New, reads its internal production notes and marks it viewed through the owner-only database functions; the
 * customer admin's page for the same request never carries the notes. Uses its own disposable org-A request.
 */
test.use({ storageState: ROLES.owner.storageState });

const note = `E2E internal production note ${randomUUID()}`;
let requestId = "";

test.beforeAll(async () => {
  requestId = randomUUID();
  const { error } = await serviceClient().from("tag_requests").insert({
    id: requestId,
    organization_id: ORG_A,
    status: "in_production",
    material: "Anodized aluminum",
    tag_size: '2" x 1"',
    production_notes: note,
  });
  if (error) throw new Error(`seed tag request: ${error.message}`);
});

test.afterAll(async () => {
  if (requestId) await serviceClient().from("tag_requests").delete().eq("id", requestId);
});

function queueRow(page: import("@playwright/test").Page) {
  return page.locator("tr", { has: page.locator(`a[href="/owner/tag-requests/${requestId}"]`) });
}

test("the owner queue shows a new request, its notes, and marks it viewed on open @critical", async ({ page }) => {
  await page.goto("/owner/tag-requests?viewed=unviewed");
  await expect(queueRow(page)).toBeVisible();
  await expect(queueRow(page).getByText("New", { exact: true })).toBeVisible();

  await page.goto(`/owner/tag-requests/${requestId}`);
  await expect(page.getByLabel("Internal production notes")).toHaveValue(note);

  // Opening it marked it viewed: it leaves the unviewed filter and loses its New badge.
  await page.goto("/owner/tag-requests?viewed=unviewed");
  await expect(page.locator(`a[href="/owner/tag-requests/${requestId}"]`)).toHaveCount(0);
  await page.goto("/owner/tag-requests");
  await expect(queueRow(page)).toBeVisible();
  await expect(queueRow(page).getByText("New", { exact: true })).toHaveCount(0);
});

test("the customer admin's page for the same request never carries the internal notes", async ({ browser }) => {
  const context = await browser.newContext({ storageState: ROLES.admin.storageState });
  const page = await context.newPage();
  try {
    await page.goto(`/dashboard/tag-requests/${requestId}`);
    await expect(page.getByRole("heading", { name: "Tag request" })).toBeVisible();
    await expect(page.getByText("Anodized aluminum")).toBeVisible();
    expect(await page.content()).not.toContain(note);
  } finally {
    await context.close();
  }
});
