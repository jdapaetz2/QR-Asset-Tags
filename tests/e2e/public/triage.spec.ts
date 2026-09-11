import { test, expect, type Page } from "@playwright/test";

import { createAsset, readAssetActiveSession, readLatestSubmissionData } from "../support/seed";

/**
 * Engineering Phase D2 — optional reported triage on the public damage and support forms, and the truthful
 * confirmation page. Every test uses its own disposable asset, so each has its own rate-limit bucket and its own
 * stored rows. Mobile viewport, like the renter at the machine.
 */
test.use({ viewport: { width: 390, height: 844 } });

const STATE = /Can the equipment be used\?/;
const NEED = /How soon do you need help\?/;
const SEVERITY = /How serious does the damage look\?/;
const ISSUE = /What do you need help with\?/;

function question(page: Page, name: RegExp) {
  return page.getByRole("group", { name });
}

async function answer(page: Page, name: RegExp, label: string) {
  await question(page, name).getByText(label, { exact: true }).click();
}

async function fillContact(page: Page) {
  await page.getByLabel("Your name").fill("Renter Rita");
  await page.getByRole("textbox", { name: "Email" }).fill("rita@example.test");
}

test.describe("damage form triage", () => {
  test("questions are optional, blank by default, and can be changed or cleared @critical", async ({ page }) => {
    const { shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/damage`);

    for (const name of [STATE, NEED, SEVERITY]) {
      const group = question(page, name);
      await expect(group).toBeVisible();
      await expect(group.getByText("(optional)")).toBeVisible();
      await expect(group.locator('input[type="radio"]:checked')).toHaveCount(0);
    }
    for (const field of ["reported_equipment_state", "reported_response_need", "reported_damage_severity"]) {
      await expect(page.locator(`input[type="hidden"][name="${field}"]`)).toHaveValue("");
    }
    // The misleading pre-selected urgency is gone.
    await expect(page.locator('select[name="urgency"]')).toHaveCount(0);

    const stored = page.locator('input[type="hidden"][name="reported_equipment_state"]');
    await answer(page, STATE, "It's not safe to use");
    await expect(stored).toHaveValue("unsafe_to_operate");
    await answer(page, STATE, "No, it won't run or work");
    await expect(stored).toHaveValue("not_operating");
    await question(page, STATE).getByRole("button", { name: "Clear answer" }).click();
    await expect(stored).toHaveValue("");
    await expect(question(page, STATE).locator('input[type="radio"]:checked')).toHaveCount(0);
  });

  test("an answer can be chosen with the keyboard", async ({ page }) => {
    const { shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/damage`);
    const stored = page.locator('input[type="hidden"][name="reported_response_need"]');
    await question(page, NEED).locator('input[type="radio"]').first().focus();
    await page.keyboard.press("Space");
    await expect(stored).toHaveValue("routine");
    await page.keyboard.press("ArrowRight");
    await expect(stored).toHaveValue("prompt");
  });

  test("an unsafe report stores the answers and offers a call-now button @critical", async ({ page }) => {
    const { assetId, shortCode } = await createAsset({ supportPhone: "(604) 555-0100" });
    await page.goto(`/forms/${shortCode}/damage`);
    await fillContact(page);
    await answer(page, STATE, "It's not safe to use");
    await answer(page, NEED, "I need help now");
    await answer(page, SEVERITY, "Major — serious damage");
    await page.getByLabel("What's damaged?").fill("Tipped onto its side on the slope.");
    await page.getByRole("button", { name: "Submit damage report" }).click();

    await page.waitForURL(/\/damage\/thanks\?ref=SUB-\d{4}-[0-9A-F]{6}&call=1$/);
    const block = page.locator("[data-call-now]");
    await expect(block).toBeVisible();
    const call = block.getByRole("link", { name: "Call (604) 555-0100" });
    await expect(call).toHaveAttribute("href", "tel:6045550100");
    // Tenant colour (validated default here), never the Mulemark brass.
    const background = await call.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).not.toBe("rgb(168, 123, 34)");
    await expect(page.getByText(/has your report\./)).toBeVisible();
    await expect(page.getByText(/has been notified/)).toHaveCount(0);
    await expect(page.getByText("Keep this reference for follow-up.")).toBeVisible();

    expect(await readLatestSubmissionData(assetId, "damage_report")).toEqual({
      triage_version: 1,
      reported_equipment_state: "unsafe_to_operate",
      reported_response_need: "immediate",
      reported_damage_severity: "major",
      description: "Tipped onto its side on the slope.",
    });
    // A public report never changes the asset's rental state.
    expect(await readAssetActiveSession(assetId)).toBeNull();
  });

  test("a routine report shows the truthful confirmation with no call-now block", async ({ page }) => {
    const { assetId, shortCode } = await createAsset({ supportPhone: "(604) 555-0100" });
    await page.goto(`/forms/${shortCode}/damage`);
    await fillContact(page);
    await answer(page, STATE, "Yes, it works normally");
    await answer(page, NEED, "No rush");
    await answer(page, SEVERITY, "Minor — scratches or dents");
    await page.getByLabel("What's damaged?").fill("Small scratch on the fender.");
    await page.getByRole("button", { name: "Submit damage report" }).click();

    await page.waitForURL(/\/damage\/thanks\?ref=SUB-\d{4}-[0-9A-F]{6}$/);
    await expect(page.locator("[data-call-now]")).toHaveCount(0);
    await expect(page.getByText(/has your report\./)).toBeVisible();
    await expect(page.getByText(/has been notified/)).toHaveCount(0);
    expect(await readLatestSubmissionData(assetId, "damage_report")).toMatchObject({
      reported_equipment_state: "operating",
      reported_response_need: "routine",
      reported_damage_severity: "minor",
    });
  });

  test("skipped questions are stored as not reported", async ({ page }) => {
    const { assetId, shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/damage`);
    await fillContact(page);
    await page.getByLabel("What's damaged?").fill("Dent on the door.");
    await page.getByRole("button", { name: "Submit damage report" }).click();
    await page.waitForURL(/\/damage\/thanks/);
    expect(await readLatestSubmissionData(assetId, "damage_report")).toEqual({
      triage_version: 1,
      reported_equipment_state: null,
      reported_response_need: null,
      reported_damage_severity: null,
      description: "Dent on the door.",
    });
  });

  test("without a usable phone the call-now block gives contact guidance and no broken button", async ({ page }) => {
    const { shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/damage`);
    await fillContact(page);
    await answer(page, STATE, "It's stuck or can't be moved");
    await page.getByLabel("What's damaged?").fill("Stuck in the ditch.");
    await page.getByRole("button", { name: "Submit damage report" }).click();

    await page.waitForURL(/&call=1$/);
    const block = page.locator("[data-call-now]");
    await expect(block).toBeVisible();
    await expect(block.getByText(/contact .+ directly/)).toBeVisible();
    await expect(block.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test("a server validation error keeps the selected answers", async ({ page }) => {
    const { shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/damage`);
    await page.getByLabel("Your name").fill("Renter Rita");
    // No email or phone → the server refuses with a field error.
    await answer(page, STATE, "It's not safe to use");
    await page.getByLabel("What's damaged?").fill("Tipped over.");
    await page.getByRole("button", { name: "Submit damage report" }).click();

    // Next's route announcer is also role="alert", so match the form's message itself.
    await expect(page.getByText("Provide an email or a phone number.")).toBeVisible();
    await expect(page.locator('input[type="hidden"][name="reported_equipment_state"]')).toHaveValue(
      "unsafe_to_operate"
    );
    await expect(question(page, STATE).locator('input[type="radio"]:checked')).toHaveCount(1);
  });

  test("Back from the confirmation returns to a blank form", async ({ page }) => {
    const { shortCode } = await createAsset();
    await page.goto(`/forms/${shortCode}/damage`);
    await fillContact(page);
    await answer(page, NEED, "No rush");
    await page.getByLabel("What's damaged?").fill("Scratch.");
    await page.getByRole("button", { name: "Submit damage report" }).click();
    await page.waitForURL(/\/damage\/thanks/);

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Report damage" })).toBeVisible();
    await expect(question(page, NEED)).toBeVisible();
    await expect(question(page, NEED).locator('input[type="radio"]:checked')).toHaveCount(0);
  });
});

test.describe("support form triage", () => {
  test("a rollover or safety issue offers the call-now button", async ({ page }) => {
    const { assetId, shortCode } = await createAsset({ supportPhone: "604-555-0199" });
    await page.goto(`/forms/${shortCode}/support`);
    await fillContact(page);
    await expect(question(page, ISSUE).locator('input[type="radio"]:checked')).toHaveCount(0);
    await answer(page, ISSUE, "Rollover or safety issue");
    await page.getByLabel("Describe the problem").fill("It rolled onto its side.");
    await page.getByRole("button", { name: "Send support request" }).click();

    await page.waitForURL(/\/support\/thanks\?ref=SUB-\d{4}-[0-9A-F]{6}&call=1$/);
    await expect(page.locator("[data-call-now]").getByRole("link", { name: "Call 604-555-0199" })).toHaveAttribute(
      "href",
      "tel:6045550199"
    );
    expect(await readLatestSubmissionData(assetId, "support_request")).toMatchObject({
      triage_version: 1,
      reported_issue_type: "rollover_safety",
      reported_response_need: null,
    });
  });

  test("an operating question shows no call-now block", async ({ page }) => {
    const { shortCode } = await createAsset({ supportPhone: "604-555-0199" });
    await page.goto(`/forms/${shortCode}/support`);
    await fillContact(page);
    await answer(page, ISSUE, "How to use it");
    await answer(page, NEED, "No rush");
    await page.getByLabel("Describe the problem").fill("How do I fold the ramps?");
    await page.getByRole("button", { name: "Send support request" }).click();

    await page.waitForURL(/\/support\/thanks\?ref=SUB-\d{4}-[0-9A-F]{6}$/);
    await expect(page.locator("[data-call-now]")).toHaveCount(0);
    await expect(page.getByText(/has your report\./)).toBeVisible();
  });
});
