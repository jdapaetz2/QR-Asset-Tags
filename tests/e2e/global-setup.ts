import { assertLocal, getStackConfig } from "../security/setup/stack";
import { applyLocalGrantParity } from "../security/setup/grants";
import { seedFixtures, serviceClient, ORG_A, ASSET } from "../security/setup/fixtures";
import { seedE2eExtras } from "./support/seed";
import { E2E_BASE_URL } from "./support/roles";

/**
 * Phase A6.1 — Playwright global setup. Reuses the A3.2 fixtures rather than duplicating them:
 *   1. resolve the local stack + re-assert the loopback guard (never seed a non-local DB);
 *   2. apply local grant parity (the running app + the seeder both need service_role/authenticated grants
 *      the local stack lacks by default);
 *   3. seed the deterministic dataset (orgs A/B/C, owner + admin/staff × 2 orgs + disabled, assets,
 *      active QR links, documents, submissions, rental session, templates);
 *   4. add the one Part-C item the security fixtures lack: a DISABLED QR link.
 *
 * Idempotent (the seeder teardown-then-reseeds), so it is safe to re-run.
 */
export default async function globalSetup(): Promise<void> {
  const { apiUrl } = getStackConfig();
  assertLocal(apiUrl);

  await applyLocalGrantParity();
  await seedFixtures();

  // A disabled QR link (active QR links are seeded by seedFixtures) — for A6.2's scan-state coverage.
  const admin = serviceClient();
  const { error } = await admin.from("qr_links").insert({
    organization_id: ORG_A,
    asset_id: ASSET.A_PRIVATE,
    short_code: "a3-a-disabled",
    public_url: "http://127.0.0.1/t/a3-a-disabled",
    status: "disabled",
  });
  if (error) throw new Error(`e2e global-setup: seeding the disabled QR link failed: ${error.message}`);

  // Phase A6.2 — read-only enrichment for the golden-path suite (equipment-page content, a resolvable
  // return template, and one rich rental-session evidence graph). Kept out of the A3.2 security fixtures.
  await seedE2eExtras();

  await assertServerUsesFixtureStack();
}

/**
 * Phase E1 — a REUSED server (reuseExistingServer locally) skips the webServer command, and with it the
 * assert-safe-env check. Prove the server on the E2E port reads THIS fixture stack before any test runs: the
 * fixture-only code must resolve. A server started some other way (for example against .env.local, which is the
 * Production env file) would not know it. The probe uses the scan-free /nojs render, so it records no scan.
 */
async function assertServerUsesFixtureStack(): Promise<void> {
  let status = 0;
  let body = "";
  try {
    const res = await fetch(`${E2E_BASE_URL}/nojs/t/a3-a-pub`, { redirect: "manual" });
    status = res.status;
    body = await res.text();
  } catch (err) {
    throw new Error(`e2e global-setup: the server on ${E2E_BASE_URL} could not be reached (${String(err).split("\n")[0]})`);
  }
  const unavailable = /This page isn(?:&#x27;|&#39;|&apos;|’|')t available/i.test(body);
  if (status !== 200 || unavailable || !/A Public|A-PUB/.test(body)) {
    throw new Error(
      `e2e global-setup: the server on ${E2E_BASE_URL} does not resolve the local fixture code (HTTP ${status}). ` +
        "It is not running against this local stack — stop it and let Playwright start its own server."
    );
  }
}
