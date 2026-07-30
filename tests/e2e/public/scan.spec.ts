import { test, expect } from "@playwright/test";

import { expectNoHorizontalOverflow } from "../support/actions";

/**
 * Part A — public mobile scan page (anon, ~390px). The renter's first surface: it must render the active
 * page, hide unavailable tags without disclosing why, expand Quick Start, expose documents, and never
 * scroll horizontally. Uses the A3.2 baseline public asset `a3-a-pub` (enriched by seedE2eExtras with
 * Quick Start + section content) and its public manual.
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe("public scan page", () => {
  test("active tag renders identity, actions, and content @critical", async ({ page }) => {
    const res = await page.goto("/t/a3-a-pub");
    expect(res?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "A Public" })).toBeVisible();
    await expect(page.getByText("A-PUB").first()).toBeVisible();
    // Both the main nav and the sticky bar expose Report Damage — at least one is present.
    await expect(page.getByRole("link", { name: "Report Damage" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Return checklist" }).first()).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test("Quick Start expands to reveal its body", async ({ page }) => {
    await page.goto("/t/a3-a-pub");
    const details = page.locator("#quick-start");
    await expect(details).toBeVisible();
    // Quick Start may auto-expand on the first scan of an active session; open it only if still closed
    // (a blind summary click would toggle an already-open section shut).
    if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) {
      await details.locator("summary").click();
    }
    await expect(page.getByText("Check the fluids", { exact: false })).toBeVisible();
  });

  test("a public document opens in a new tab", async ({ page }) => {
    await page.goto("/t/a3-a-pub");
    const openLink = page.getByRole("link", { name: "Open", exact: true }).first();
    await expect(openLink).toBeVisible();
    await expect(openLink).toHaveAttribute("target", "_blank");
    // Signed URL to the documents bucket (never a raw storage path).
    await expect(openLink).toHaveAttribute("href", /token=|\/documents\//);
  });

  test.describe("unavailable tags read 200 without disclosing the reason @critical", () => {
    for (const [label, code] of [
      ["a disabled QR link", "a3-a-disabled"],
      ["a nonexistent tag", "no-such-tag-xyz"],
    ] as const) {
      test(label, async ({ page }) => {
        const res = await page.goto(`/t/${code}`);
        expect(res?.status(), "unavailable is a soft 200, not a 404").toBe(200);
        await expect(page.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
        // The reason (disabled / private / missing) is never disclosed.
        await expect(page.getByText(/disabled|private|not found/i)).toHaveCount(0);
      });
    }
  });
});
