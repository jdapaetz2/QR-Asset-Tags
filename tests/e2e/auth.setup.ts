import { test as setup, expect } from "@playwright/test";

import { E2E_PASSWORD, ROLES, type RoleKey } from "./support/roles";

/**
 * Phase A6.1 — the auth "setup" project. For each E2E role it performs a REAL password login through the
 * app UI (no magic link, no email) and saves the resulting Supabase session as storage state under
 * `.auth/<role>.json` (gitignored). This doubles as the login-helper test: every run exercises the real
 * login path. Each `setup(...)` block gets a fresh browser context, so the four logins never bleed into
 * each other.
 */
for (const key of Object.keys(ROLES) as RoleKey[]) {
  setup(`authenticate ${key}`, async ({ page }) => {
    const role = ROLES[key];
    await page.goto("/login");
    await page.getByLabel("Email").fill(role.email);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // The password action redirects by role; wait for the expected landing before persisting state.
    await page.waitForURL(`**${role.landing}`);
    await expect(page).toHaveURL(new RegExp(`${role.landing}$`));

    await page.context().storageState({ path: role.storageState });
  });
}
