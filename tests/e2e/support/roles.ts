import { join } from "node:path";

import { ACTORS, TEST_PASSWORD } from "../../security/setup/fixtures";

/**
 * Phase A6.1 — E2E role registry. Maps the four E2E roles onto the reused A3.2 fixture users, and defines
 * where each role's storage state lives. No password is hard-coded here: it comes from the shared
 * env-overridable `TEST_PASSWORD` (default is a local, non-secret throwaway; supply `E2E_PASSWORD` for any
 * non-local target). Storage-state files live under `.auth/` and are gitignored.
 */

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** The password used to log every fixture user in (seeder + auth setup share this source). */
export const E2E_PASSWORD = TEST_PASSWORD;

// Playwright runs from the project root; keep auth state under tests/e2e/.auth (gitignored). Resolved
// from cwd (not import.meta) so it works under Playwright's CommonJS transpile.
const authDir = join(process.cwd(), "tests", "e2e", ".auth");

export function storageStatePath(role: RoleKey): string {
  return join(authDir, `${role}.json`);
}

export type RoleKey = "owner" | "admin" | "staff" | "second_org";
export const ROLE_KEYS: RoleKey[] = ["owner", "admin", "staff", "second_org"];

export type RoleFixture = {
  /** Which reused A3.2 fixture actor backs this role. */
  actor: keyof typeof ACTORS;
  email: string;
  landing: string;
  storageState: string;
};

export const ROLES: Record<RoleKey, RoleFixture> = {
  owner: { actor: "owner", email: ACTORS.owner.email, landing: "/owner", storageState: storageStatePath("owner") },
  admin: { actor: "admin_a", email: ACTORS.admin_a.email, landing: "/dashboard", storageState: storageStatePath("admin") },
  staff: { actor: "staff_a", email: ACTORS.staff_a.email, landing: "/dashboard", storageState: storageStatePath("staff") },
  second_org: {
    actor: "admin_b",
    email: ACTORS.admin_b.email,
    landing: "/dashboard",
    storageState: storageStatePath("second_org"),
  },
};
