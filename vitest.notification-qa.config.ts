import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Engineering Phase D5 — read-only Production notification content check (`npm run production:qa-notification-content`,
 * env from `.env.local`). Loads the saved rows referenced by the latest notification QA matrix artifact and renders them
 * with the real projection, routing and email builders. Separate from `npm test` (no network). The test itself refuses
 * any project that is not Production and reads only the QA organization.
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
    include: ["tests/qa/**/*.production.test.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
