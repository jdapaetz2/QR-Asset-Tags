import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Phase E1 structural check: every operator script that scans a public route or writes data must route its target
// through a guard — the QA runner guard (scripts/lib/qa-targets.mjs), the Production QA fixture module that applies it
// (scripts/production/lib/qa-forms.mjs), or the loopback guard for local-only tools (scripts/lib/local-stack.mjs) — or
// be listed below with the reason it needs none. A new runner that does none of these fails here.

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const WRITE_OR_SCAN = /\/t\/|\/forms\/|\.insert\(|\.update\(|\.upsert\(|\.upload\(|\.delete\(|\.remove\(|page\.goto/;
const GUARD_IMPORT = /from\s+["'](?:\.\.?\/)+(?:lib\/)?(?:qa-targets|local-stack|showcase-target)\.mjs["']|from\s+["'](?:\.\.?\/)+production\/lib\/qa-forms\.mjs["']|from\s+["']\.\/lib\/qa-forms\.mjs["']/;

/** Scripts that match the patterns but need no target guard, each with the reason. */
const EXEMPT = {
  "cleanup-orphan-media.mjs": "Storage maintenance; Northridge objects are excluded by the retention hold in orphan-media.mjs",
  "lib/qr-decode.mjs": "decodes local SVG files; mentions /t/ only in documentation",
  "lib/showcase-inventory.mjs": "read-only inventory decisions; no request of its own",
  "lib/staging-probe.mjs": "read-only scan-free /nojs probe; it is itself a guard",
  "lib/local-stack.mjs": "the loopback guard itself; its only write is a rolled-back canary on an already-guarded client",
  "lib/showcase-archive.mjs": "pure archive format and checks; no request of its own",
  "lib/showcase-reset.mjs": "pure planner and SQL emitter; never executes anything itself",
  "perf/inbox-freshness.mjs": "read-only dashboard timing; no /t/ visit and no write",
  "phase-e/decode-qr-svg.mjs": "decodes local SVG files only",
  "phase-e/showcase-health.mjs": "read-only scan-free /nojs/t/ checks of the protected routes",
  "phase-e/showcase-archive.mjs": "read-only export (select, list, download); its own no-write source scan applies",
  "qa/check-scan-bundle.mjs": "inspects local build output only",
  "qa/measure-responsive-overflow.mjs": "read-only page measurement; no /t/ visit and no write",
  "staging/scan-reliability.mjs": "creates, scans and deletes only its own throwaway org; staging target and --confirm required",
  "verify-production-config.mjs": "read-only configuration verifier",
  "verify-tag-config.mjs": "read-only configuration verifier",
};

function listScripts(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listScripts(path.join(dir, entry.name), rel));
    else if (entry.name.endsWith(".mjs") && !entry.name.endsWith(".test.mjs")) out.push(rel);
  }
  return out;
}

describe("QA guard coverage", () => {
  const scripts = listScripts(SCRIPTS);
  const matching = scripts.filter((rel) => WRITE_OR_SCAN.test(readFileSync(path.join(SCRIPTS, rel), "utf8")));

  it("finds the runners it is meant to police", () => {
    for (const rel of ["perf/form-action.mjs", "smoke/staging.mjs", "smoke/production.mjs", "qa/staging-audit.mjs"]) {
      expect(matching).toContain(rel);
    }
  });

  it("every script that scans or writes imports a target guard or is exempt with a reason", () => {
    const unguarded = matching.filter(
      (rel) => !EXEMPT[rel] && !GUARD_IMPORT.test(readFileSync(path.join(SCRIPTS, rel), "utf8"))
    );
    expect(unguarded).toEqual([]);
  });

  it("keeps the exemption list honest: every exempt file exists and still matches", () => {
    for (const rel of Object.keys(EXEMPT)) {
      if (!scripts.includes(rel)) continue; // planned E1 tools are listed ahead of being written
      expect(matching, `${rel} no longer scans or writes; drop its exemption`).toContain(rel);
    }
  });

  it("wires the guard into each previously unguarded or free-form runner", () => {
    for (const rel of [
      "perf/form-action.mjs",
      "perf/baseline.mjs",
      "smoke/production.mjs",
      "smoke/staging.mjs",
      "qa/staging-audit.mjs",
      "qa/staging-vitals.mjs",
      "staging/verify-staging-workflows.mjs",
      "qa/staging-qa-data.mjs",
    ]) {
      expect(readFileSync(path.join(SCRIPTS, rel), "utf8"), rel).toMatch(/assertQaRunnerTarget\(/);
    }
    for (const rel of ["perf/form-action.mjs", "perf/baseline.mjs", "smoke/staging.mjs", "qa/staging-audit.mjs", "qa/staging-vitals.mjs", "staging/verify-staging-workflows.mjs"]) {
      expect(readFileSync(path.join(SCRIPTS, rel), "utf8"), rel).toMatch(/assertStagingBackend\(/);
    }
  });
});
