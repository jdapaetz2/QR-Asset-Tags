import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Engineering Phase D3B — fixed staging check for the daily return-exceptions summary worker (`npm run
 * digest:staging-check`). Runs the real worker and store against the STAGING database with an injected 6 AM Pacific
 * clock, one QA organization and a fake sender (no email). Separate from `npm test` (no network) and from the local
 * security suite. The test itself refuses any target that is not the declared staging project.
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
    include: ["tests/staging/**/*.staging.test.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
