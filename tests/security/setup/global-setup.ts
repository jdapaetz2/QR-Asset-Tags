import { assertLocal, getStackConfig } from "./stack";
import { applyLocalGrantParity } from "./grants";
import { seedFixtures } from "./fixtures";

/**
 * Vitest globalSetup for the executed security suite (Phase A3.2). Runs ONCE, before any
 * test file. It (1) resolves the local stack and re-asserts the loopback guard, then
 * (2) seeds the deterministic fixture graph. The migration reset itself is done by the
 * `db:reset` step chained ahead of this in `npm run test:security` (Part G), so this stays
 * fast enough to re-run on its own via `npm run test:rls`.
 */
export default async function setup(): Promise<void> {
  const { apiUrl } = getStackConfig();
  assertLocal(apiUrl); // belt-and-suspenders: never seed/destroy a non-local DB
  await applyLocalGrantParity(); // local parity so the service-role seeder matches hosted
  await seedFixtures();
}
