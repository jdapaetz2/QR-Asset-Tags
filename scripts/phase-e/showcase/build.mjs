/**
 * Engineering Phase E2B — `npm run phase-e:showcase:build [-- --anchor=YYYY-MM-DD] [--out=<file>]`.
 *
 * Runs the dataset builder (scripts/phase-e/showcase/build.showcase.ts) under vitest, which loads the app's TypeScript
 * inspection modules. Without --anchor the scenario's own anchor date is used. Writes docs/phase-e/showcase/dataset.json
 * unless --out names another file. Nothing here touches a database.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const env = { ...process.env };
for (const arg of process.argv.slice(2)) {
  const m = /^--(anchor|out)=(.+)$/.exec(arg);
  if (!m) {
    console.error(`Unknown argument ${arg} (use --anchor=YYYY-MM-DD or --out=<file>).`);
    process.exit(2);
  }
  if (m[1] === "anchor") env.SHOWCASE_ANCHOR = m[2];
  else env.SHOWCASE_OUT = path.resolve(m[2]);
}
const vitest = path.join(REPO, "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [vitest, "run", "--config", "vitest.showcase-build.config.ts"], { cwd: REPO, env, stdio: "inherit" });
process.exit(result.status ?? 1);
