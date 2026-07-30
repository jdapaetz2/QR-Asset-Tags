#!/usr/bin/env node
/**
 * Supabase CLI linked-project guard (Phase B1A).
 *
 * THE HAZARD: the CLI stores one linked project ref in `supabase/.temp/project-ref` and every remote
 * command silently uses it. `supabase db push` defaults to the linked project. `supabase db reset`
 * defaults to LOCAL, but `--linked` would reset the linked remote — and today that link points at
 * production. Nothing in the toolchain asks "is this the project you meant?" before you find out.
 *
 * This script is that question, made explicit and scriptable. It:
 *   - reads the linked ref from disk (no network call, no login required),
 *   - compares it against a ref the operator states up front,
 *   - FAILS when they differ,
 *   - prints the approved next commands only after the check passes.
 *
 * It deliberately does NOT: relink, push, reset, or run `migration repair`. It only reads and reports —
 * the operator runs the migration command themselves, having seen which project they are aimed at.
 *
 * Usage:
 *   node scripts/check-linked-project.mjs --expect=<project-ref>
 *   EXPECTED_SUPABASE_REF=<project-ref> node scripts/check-linked-project.mjs
 *
 * Project refs are public by construction (they are the hostname in NEXT_PUBLIC_SUPABASE_URL), so
 * printing them is safe. No key material is read or printed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { KNOWN_PRODUCTION_REF } from "./lib/env-target.mjs";

const REF_FILE = join(process.cwd(), "supabase", ".temp", "project-ref");

const argExpect = process.argv
  .slice(2)
  .find((a) => a.startsWith("--expect="))
  ?.split("=")[1];
const expected = argExpect || process.env.EXPECTED_SUPABASE_REF || "";

console.log("\nSupabase linked-project guard\n");

if (!expected) {
  console.log("  [FAIL] no expected project ref supplied.");
  console.log("\n  State the project you intend to act on, then re-run:");
  console.log("    node scripts/check-linked-project.mjs --expect=<project-ref>");
  console.log("    (or set EXPECTED_SUPABASE_REF)");
  console.log("\n  Fail-closed by design: this guard will not infer your intent.\n");
  process.exit(1);
}

if (!existsSync(REF_FILE)) {
  console.log("  [FAIL] no linked project found (supabase/.temp/project-ref is missing).");
  console.log("         The CLI is not linked to any remote project in this working copy.");
  console.log("\n  Link it deliberately with `npx supabase link --project-ref <ref>`,");
  console.log("  then re-run this guard. This script never links for you.\n");
  process.exit(1);
}

const linked = readFileSync(REF_FILE, "utf8").trim();

if (linked !== expected) {
  console.log(`  [FAIL] linked project does not match the expected target.`);
  console.log(`         linked:   ${linked}`);
  console.log(`         expected: ${expected}`);
  if (linked === KNOWN_PRODUCTION_REF) {
    console.log("\n  The CLI is currently linked to PRODUCTION. Any `db push` would apply to");
    console.log("  production, and `db reset --linked` would destroy it.");
  }
  console.log("\n  Refusing to proceed. Relink deliberately, or correct --expect.\n");
  process.exit(1);
}

const isProduction = linked === KNOWN_PRODUCTION_REF;

console.log(`  [PASS] linked project matches the expected target: ${linked}`);
console.log(`         classification: ${isProduction ? "PRODUCTION" : "non-production (staging or other)"}`);

console.log("\n  Approved read-only commands:");
console.log("    npx supabase migration list");
console.log("    npx supabase db push --dry-run");

if (isProduction) {
  console.log("\n  PRODUCTION procedure (docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md §3):");
  console.log("    1. `npx supabase migration list` — confirm the pending set");
  console.log("    2. `npx supabase db push --dry-run` — show exactly what would apply");
  console.log("    3. take a backup / confirm PITR");
  console.log("    4. get EXPLICIT operator approval");
  console.log("    5. only then `npx supabase db push`");
} else {
  console.log("\n  STAGING procedure (docs/STAGING_ENVIRONMENT_SETUP.md):");
  console.log("    1. `npx supabase migration list`");
  console.log("    2. `npx supabase db push --dry-run`");
  console.log("    3. `npx supabase db push`   (staging holds no customer data)");
}

console.log("\n  FORBIDDEN on any linked remote, staging included:");
console.log("    npx supabase db reset --linked      ← destroys the remote database");
console.log("    npx supabase migration repair       ← rewrites migration history");
console.log("  `db reset` without --linked is local-only and safe.\n");
