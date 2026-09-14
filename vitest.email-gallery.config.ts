import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Engineering Phase D5.1 — local operational email fixture gallery (`npm run email:gallery`). Renders every fixture in
 * tests/email/fixtures.ts with real generated previews, writes HTML, plain text, metadata and Chromium screenshots to
 * the gitignored qa-artifacts/email-gallery/, and checks budgets, links and narrow-screen overflow. Never sends email
 * and needs no environment file. Separate from `npm test` because it launches a browser.
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
    include: ["tests/email/**/*.gallery.test.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
