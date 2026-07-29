import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Executed security suite (Phase A3.2). SEPARATE from the default `vitest.config.ts` so the
 * fast, Docker-free unit run (`npm test`) never needs a database. This config drives real
 * PostgREST/Auth/Storage calls against the LOCAL Supabase stack and is invoked only by
 * `npm run test:security` / `npm run test:rls`.
 *
 * Single fork, no file parallelism: the tests share one seeded database, so they must not
 * race each other. Generous timeouts cover container round-trips and the one-time seed.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/security/**/*.test.ts"],
    globalSetup: ["tests/security/setup/global-setup.ts"],
    // One worker, no file parallelism: every test file shares one seeded database, so they
    // must run sequentially and never race (Vitest 4 moved these to top level).
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
