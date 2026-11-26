#!/usr/bin/env node
/**
 * Local ports verifier (housekeeping, 2026-11-26).
 *
 * Windows' NAT service (winnat, used by WSL, Hyper-V and Docker Desktop) reserves random blocks of 100 ports from the
 * dynamic range (49152 and up) at startup. When a block covers the local Supabase ports, `supabase start` cannot
 * publish them and `supabase db reset` leaves the database container stopped: on 2026-11-20 Windows held 54318–54417.
 *
 * This check runs before every reset (`predb:reset`, `pretest:e2e:reset`) and on demand (`npm run verify:local-ports`).
 * It reads the ports from supabase/config.toml, adds the standalone restore database's port, and prints the fix. The
 * permanent fix sets the ports aside for good (docs/E2E_TESTING.md, Troubleshooting).
 *
 * Only a positive finding fails. Not Windows (CI): skipped. netsh unavailable: a warning, never a failure.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STANDALONE_PORT, blockedPorts, configuredPorts, parseExcludedPortRanges, portExclusionCommands } from "./lib/local-stack.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "win32") {
  console.log("Local ports: skipped (the check is for Windows).");
  process.exit(0);
}

let ranges;
try {
  const netsh = execFileSync("netsh", ["interface", "ipv4", "show", "excludedportrange", "protocol=tcp"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  ranges = parseExcludedPortRanges(netsh);
} catch (err) {
  console.warn(`Local ports: WARN could not read Windows' reserved ports (${String(err.message).split("\n")[0]}); not checked.`);
  process.exit(0);
}

const stackPorts = configuredPorts(readFileSync(path.join(REPO, "supabase", "config.toml"), "utf8"));
const allPorts = [...stackPorts, STANDALONE_PORT];
const blockedStack = blockedPorts(stackPorts, ranges);
const blockedStandalone = blockedPorts([STANDALONE_PORT], ranges);

if (blockedStack.length === 0 && blockedStandalone.length === 0) {
  console.log(`Local ports: PASS (${allPorts.join(", ")}: none inside a Windows reservation).`);
  process.exit(0);
}

const fix = [
  "  Fix: open PowerShell with Run as administrator, then run these lines in order:",
  "    net stop winnat",
  ...portExclusionCommands(allPorts, ranges).map((line) => `    ${line}`),
  "    net start winnat",
  "  The netsh lines set the ports aside for good; docs/E2E_TESTING.md (Troubleshooting) explains them.",
].join("\n");

if (blockedStack.length === 0) {
  console.warn(
    `Local ports: WARN Windows reserved ${blockedStandalone.join(", ")}, the standalone restore database's port. The local stack is fine; restore drills fail until it is free.`
  );
  console.warn(fix);
  process.exit(0);
}

console.error(`Local ports: FAIL Windows reserved ${blockedStack.join(", ")}, so the local Supabase stack cannot use them.`);
console.error(fix);
process.exit(1);
