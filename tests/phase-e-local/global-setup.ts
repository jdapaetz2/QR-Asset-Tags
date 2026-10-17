import { applyGrantParity } from "../../scripts/lib/local-stack.mjs";
import { REPO, db } from "./support";

/**
 * Vitest globalSetup for the local recovery rehearsal. `npm run test:phase-e-local` resets the local database first
 * (like test:security); this re-asserts that both the API and the DB URL are loopback (inside `db()`) and applies the
 * hosted-parity grants the service-role exporter needs.
 */
export default async function setup(): Promise<void> {
  const client = await db();
  try {
    await applyGrantParity(client, REPO);
  } finally {
    await client.end();
  }
}
