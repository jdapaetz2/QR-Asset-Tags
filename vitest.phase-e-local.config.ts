import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Engineering Phase E1 — the local recovery rehearsal (`npm run test:phase-e-local`). Runs the real export, restore,
 * reset-planner and digest code against the repo's LOCAL Supabase stack with SYNTHETIC data only (tests/phase-e-local).
 * Separate from `npm test` (it needs Docker) and from the security suite. One ordered file, one worker: every step
 * builds on the database state the previous step left. No environment file is loaded (envDir points at the test folder,
 * which has none), so nothing can reach a hosted project or send email.
 */
export default defineConfig({
  envDir: fileURLToPath(new URL("./tests/phase-e-local", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/phase-e-local/**/*.local.test.ts"],
    globalSetup: ["tests/phase-e-local/global-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 300000,
    hookTimeout: 300000,
  },
});
