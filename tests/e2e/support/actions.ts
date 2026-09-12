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

/**
 * A JPEG-signed payload of `bytes` bytes: real JPEG magic bytes, filler body. Large enough to exceed the 4 MB action
 * body limit, so it only reaches storage through the direct-upload path (lib/forms/upload-contract.ts).
 */
export function largeJpeg(name = "large.jpg", bytes = 2_500_000): { name: string; mimeType: string; buffer: Buffer } {
  const buffer = Buffer.alloc(bytes, 0x5a);
  buffer.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01], 0);
  return { name, mimeType: "image/jpeg", buffer };
}

/** A PDF-signed payload of `bytes` bytes: a real `%PDF-` header, filler body. For hosted documents over 4.5 MB. */
export function largePdf(name = "manual.pdf", bytes = 12_000_000): { name: string; mimeType: string; buffer: Buffer } {
  const buffer = Buffer.alloc(bytes, 0x20);
  buffer.write("%PDF-1.7\n%Mulemark E2E document\n", 0, "latin1");
  return { name, mimeType: "application/pdf", buffer };
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
  // Wait for the stage to actually be on screen before counting. This helper used to count immediately,
  // which silently returned ZERO groups whenever anything stood between navigation and the form — it
  // then answered nothing and the failure surfaced later, somewhere else. Phase C8's route-level loading
  // skeleton made that latent race visible; the assumption was always unsafe.
  await groups.first().waitFor({ state: "visible", timeout: 30_000 });
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
