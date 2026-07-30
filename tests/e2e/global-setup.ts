import { assertLocal, getStackConfig } from "../security/setup/stack";
import { applyLocalGrantParity } from "../security/setup/grants";
import { seedFixtures, serviceClient, ORG_A, ASSET } from "../security/setup/fixtures";

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
}
