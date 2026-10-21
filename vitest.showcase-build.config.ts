import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Engineering Phase E2B — the showcase dataset builder (`npm run phase-e:showcase:build`). Not a test suite: vitest is
 * only the TypeScript runner that lets the builder call the app's own inspection, triage and scan modules. No
 * environment file is loaded (envDir points at the builder's folder, which has none) and nothing reaches a database.
 */
export default defineConfig({
  envDir: fileURLToPath(new URL("./scripts/phase-e/showcase", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/phase-e/showcase/build.showcase.ts"],
    testTimeout: 120000,
  },
});
