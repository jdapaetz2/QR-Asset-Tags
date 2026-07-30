import { defineConfig, devices } from "@playwright/test";

import { getStackConfig } from "./tests/security/setup/stack";
import { E2E_PORT, E2E_BASE_URL, E2E_SCAN_SALT, ROLE_KEYS } from "./tests/e2e/support/roles";

/**
 * Phase A6.1 — Playwright foundation. Runs the real app against the LOCAL Supabase stack only.
 *
 * SAFETY: baseURL is always loopback (127.0.0.1). The webServer's Supabase credentials come from
 * `supabase status` (resolved by getStackConfig, which refuses any non-loopback host), so E2E can never
 * be pointed at production by accident. Notifications run in dry-run (RESEND unset) — no email dependency.
 *
 * Shared DB state → workers:1, no file parallelism. Requires `npx supabase start` first.
 */
const stack = getStackConfig(); // throws (and prints only the host) if the stack is missing or non-local

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    // Authenticates each role once (real UI login) and saves storage state; every role spec depends on it.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /.*\.spec\.ts/,
    },
  ],

  webServer: {
    // Production build + start (NOT `next dev`): no HMR, deterministic hydration — dev-mode HMR left
    // client components (e.g. the Radix account menu) intermittently non-interactive. Slower to boot,
    // far more stable for browser tests. `reuseExistingServer` locally skips the rebuild when a server
    // is already up on the port.
    // Remove any dev-only generated types (left by a prior `next dev`) so the production type-check is
    // deterministic, then build + start.
    command: `node -e "require('fs').rmSync('.next/dev',{recursive:true,force:true})" && next build && next start -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 420_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: stack.apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: stack.serviceRoleKey,
      NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,
      // Local-only, non-secret salt so scan logging works; fail-soft outside prod/preview anyway.
      // Shared with seed helpers so they can compute the exact rate-limit bucket key.
      SCAN_IP_HASH_SALT: E2E_SCAN_SALT,
      // RESEND_* intentionally unset → notifications dry-run (no email in E2E).
    },
  },

  metadata: { roles: ROLE_KEYS },
});
