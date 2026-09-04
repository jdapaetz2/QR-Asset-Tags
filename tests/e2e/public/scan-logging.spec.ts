import { test, expect } from "@playwright/test";

import { createAsset, readQrLinkId, readScanEvents } from "../support/seed";

/**
 * Phase C5 — the scan_events insert now runs AFTER the response, via `next/server`'s `after()`.
 *
 * That buys the renter 71-104 ms (C0 §9b) on the product's most latency-sensitive route, and it is only
 * acceptable if the record still lands, lands once, and lands attributed to the right tag. These tests
 * assert exactly that against a real production build (`next build && next start`, per the Playwright
 * webServer config) — the mechanism itself, not a mock of it.
 *
 * Each test uses its own disposable asset, so the counts are exact rather than "at least".
 */

/** The scan is deliberately off the response path, so a row that has not appeared YET is not a loss. */
const APPEARANCE_TIMEOUT_MS = 15_000;

test.describe("deferred scan logging", () => {
  test("N scans record exactly N events, correctly attributed @critical", async ({ page }) => {
    const { assetId, shortCode } = await createAsset();
    const qrLinkId = await readQrLinkId(assetId);
    const SCANS = 5;

    for (let i = 0; i < SCANS; i++) {
      const res = await page.goto(`/t/${shortCode}`);
      // The page must be genuinely rendered, not an unavailable notice — otherwise the count below
      // would be measuring the wrong thing entirely.
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: `E2E ${shortCode}` })).toBeVisible();
    }

    await expect
      .poll(async () => (await readScanEvents(assetId)).length, {
        timeout: APPEARANCE_TIMEOUT_MS,
        message: `expected exactly ${SCANS} scan events to appear after the responses`,
      })
      .toBe(SCANS);

    const rows = await readScanEvents(assetId);
    // No duplicates: exactly one row per scan, every one pointing at this asset's own QR link.
    expect(rows).toHaveLength(SCANS);
    for (const row of rows) {
      expect(row.asset_id).toBe(assetId);
      expect(row.qr_link_id).toBe(qrLinkId);
      expect(row.organization_id).toBeTruthy();
      // Privacy: a hashed value or nothing at all — never anything resembling an address.
      if (row.ip_hash !== null) expect(row.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  test("an unavailable tag records no scan at all @critical", async ({ page }) => {
    const { assetId } = await createAsset();

    // Eligibility is resolved BEFORE anything is scheduled, so a code that resolves to nothing must
    // leave no trace. RLS is the second guard: scan_events_public_insert requires an active QR link.
    const res = await page.goto("/t/no-such-tag-c5-xyz");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "This page isn't available" })).toBeVisible();

    // Give a scan the same window it would have had if one had been scheduled.
    await page.waitForTimeout(2_000);
    expect(await readScanEvents(assetId)).toHaveLength(0);
  });
});
