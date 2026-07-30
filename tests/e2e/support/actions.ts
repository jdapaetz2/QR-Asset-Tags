import { expect, type Page } from "@playwright/test";

import { E2E_PASSWORD, ROLES, type RoleKey } from "./roles";

/**
 * Phase A6.2 — shared browser helpers. Reused across persona specs so selectors/flows stay in one place.
 */

/** Fresh UI password login for a role (no magic link, no email). */
export async function login(page: Page, role: RoleKey): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ROLES[role].email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${ROLES[role].landing}`);
}

/** A valid 1×1 PNG as a Playwright upload payload (no file on disk). */
export function tinyPng(name = "photo.png"): { name: string; mimeType: string; buffer: Buffer } {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  return { name, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

/** A wrong-type file (text) to trigger server-side media validation rejection. */
export function badTypeFile(name = "notes.txt"): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "text/plain", buffer: Buffer.from("not an image", "utf8") };
}

/** Assert the page body does not scroll horizontally at the current viewport. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}

/**
 * Answer the guided return form's Condition stage (utility_trailer): every visible required choice group
 * gets its first option (Pass / Yes), except the damage-observed field which is set explicitly so the
 * happy path stays photo-free and the damage path opens the omission dialog.
 */
export async function answerConditionStage(page: Page, opts: { damage: boolean }): Promise<void> {
  const groups = page.locator('fieldset[id^="field-"]:visible');
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const group = groups.nth(i);
    const id = (await group.getAttribute("id")) ?? "";
    // The damage field is `damage_observed` (return) or `existing_damage` (outbound) — set it explicitly.
    if (/damage/.test(id)) {
      await group.getByText(opts.damage ? "Yes" : "No", { exact: true }).click();
    } else {
      // First choice = Pass (pass_fail) or Yes (yes_no); clicking the label toggles the sr-only radio.
      await group.locator("label").first().click();
    }
  }
}

/** Fill + submit the shared public damage form; returns after the thanks redirect (or leaves on error). */
export async function submitDamage(
  page: Page,
  shortCode: string,
  opts: { name?: string; email?: string; description?: string; file?: { name: string; mimeType: string; buffer: Buffer } } = {}
): Promise<void> {
  await page.goto(`/forms/${shortCode}/damage`);
  await page.getByLabel("Your name").fill(opts.name ?? "Renter Rita");
  await page.getByRole("textbox", { name: "Email" }).fill(opts.email ?? "rita@example.test");
  await page.getByLabel("What's damaged?").fill(opts.description ?? "Cracked windshield");
  if (opts.file) await page.locator('input[name="media"]').setInputFiles(opts.file);
  await page.getByRole("button", { name: "Submit damage report" }).click();
}
