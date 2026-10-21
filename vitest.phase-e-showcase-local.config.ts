import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Engineering Phase E2B — the local showcase rehearsal (`npm run test:phase-e-showcase-local`). Runs the real bootstrap,
 * reset planner, presenter reset, refresh, rollback and digest worker against the repo's LOCAL Supabase stack with the
 * SYNTHETIC showcase dataset only (tests/phase-e-showcase-local). Separate from `npm test` (it needs Docker) and from
 * the E1 suite. One ordered file, one worker. No environment file is loaded (envDir points at the test folder, which has
 * none), so nothing can reach a hosted project or send email.
 */
export default defineConfig({
  envDir: fileURLToPath(new URL("./tests/phase-e-showcase-local", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/phase-e-showcase-local/**/*.local.test.ts"],
    globalSetup: ["tests/phase-e-local/global-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 600000,
    hookTimeout: 300000,
  },
});
