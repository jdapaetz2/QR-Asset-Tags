#!/usr/bin/env node
/**
 * Local target verifier (Phase B1A).
 *
 * Confirms the shell is pointed at a LOCAL Docker Supabase stack — the only target where destructive
 * operations (`db reset`, fixture teardown/reseed) are permitted without ceremony.
 *
 * This complements, and does not replace, the runtime guard in tests/security/setup/stack.ts
 * (`assertLocal`), which resolves the stack from `supabase status` and already refuses any non-loopback
 * host. This script exists so an operator can check a shell BEFORE running something destructive,
 * rather than discovering the target from a thrown test error.
 *
 * NEVER PRINTS key material.
 *
 * Run: npm run verify:local-target
 */
import { assertTarget } from "./lib/env-target.mjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

console.log("\nLocal target verifier\n");

if (!supabaseUrl) {
  console.log("  [FAIL] supabase-url: NEXT_PUBLIC_SUPABASE_URL is not set in this shell.");
  console.log("\n  Local target: NOT VERIFIED. Do not run destructive commands.\n");
  process.exit(1);
}

try {
  const resolved = assertTarget("local", { supabaseUrl });
  console.log(`  [PASS] target: resolved LOCAL (host: ${resolved.host}) — ${resolved.reason}`);
} catch (err) {
  console.log(`  [FAIL] target: ${err.message}`);
  console.log("\n  Local target: NOT VERIFIED.");
  console.log("  Destructive local commands (`supabase db reset --local`, the security suite,");
  console.log("  the Playwright fixtures) must only ever run against `npx supabase start`.\n");
  process.exit(1);
}

console.log(
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? "  [PASS] service-role: present (local CLI key; value not read or printed)"
    : "  [WARN] service-role: not set — the security suite resolves its own key from `supabase status`"
);

console.log("\n  Local target: VERIFIED. Destructive local operations may proceed.\n");
