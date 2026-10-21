/**
 * Engineering Phase E2B — the LOCAL-STACK-ONLY logins of the showcase rehearsal: the Northridge admin the bootstrap
 * creates for the walkthrough and the local suite, and the platform owner the walkthrough uses for the owner report.
 * Reserved `.invalid` addresses; the password is the E1 local fixture default (or E2E_PASSWORD), never a real one.
 * No hosted target ever gets these accounts. (Plain constants, no import.meta: Playwright loads this too.)
 */
export const LOCAL_ADMIN = Object.freeze({
  authId: "e2b00000-0000-4000-8000-000000000001",
  profileId: "e2b10000-0000-4000-8000-000000000001",
  email: "showcase.admin@phase-e-showcase.invalid",
  name: "Showcase Presenter (local)",
});

export const LOCAL_OWNER = Object.freeze({
  authId: "e2b00000-0000-4000-8000-000000000002",
  profileId: "e2b10000-0000-4000-8000-000000000002",
  email: "showcase.owner@phase-e-showcase.invalid",
  name: "Showcase Owner (local)",
});

export const LOCAL_PASSWORD = process.env.E2E_PASSWORD ?? "phase-e-local-fixture-only";
