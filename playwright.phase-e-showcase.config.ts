import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE_URL, E2E_PORT, E2E_SCAN_SALT } from "./tests/e2e/support/roles";
import { getStackConfig } from "./tests/security/setup/stack";

/**
 * Engineering Phase E2B — the showcase walkthrough (`npm run test:phase-e-showcase-walkthrough`, which resets the LOCAL
 * database first). The four sales stories run in the real app against the local stack with the synthetic showcase
 * dataset applied by the global setup. The web server is the E2E one: a production build on loopback whose Supabase
 * credentials come from `supabase status`, with the email and cron variables DEFINED AND EMPTY so nothing from
 * .env.local (the Production env file) can reach it; scripts/e2e/assert-safe-env.mjs proves it before the build.
 * Screenshots go to qa-artifacts/phase-e-showcase/ (gitignored).
 */
const stack = getStackConfig();

export default defineConfig({
  testDir: "./tests/phase-e-showcase-walkthrough",
  outputDir: "./test-results/phase-e-showcase",
  globalSetup: "./tests/phase-e-showcase-walkthrough/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: E2E_BASE_URL, trace: "retain-on-failure", screenshot: "only-on-failure", video: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node scripts/e2e/assert-safe-env.mjs && node scripts/vendor-libheif.mjs && next build && next start -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: true,
    timeout: 420_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: stack.apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: stack.serviceRoleKey,
      NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,
      SCAN_IP_HASH_SALT: E2E_SCAN_SALT,
      RESEND_API_KEY: "",
      NOTIFICATION_FROM_EMAIL: "",
      CRON_SECRET: "",
    },
  },
});
