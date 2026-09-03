#!/usr/bin/env node
/**
 * Phase C0 — aggregate the gated `[timing]` phase logs from a deployment.
 *
 * The baseline harness measures whole-route latency from the browser. It cannot see *inside* one
 * request, so it could bound the authenticated floor (<=342 ms) but never split identity work from
 * page data. `lib/diagnostics/server-timing.ts` emits one structured line per phase; this reads them
 * back and reports medians, so C1 starts from a measurement rather than a guess.
 *
 * READ-ONLY. It runs `vercel logs`, parses, and prints. It deploys nothing and changes nothing.
 *
 * The counts matter as much as the durations: `auth.profile` appearing TWICE per authenticated request
 * is the duplication hypothesis, observed rather than reasoned about.
 *
 * Usage: npm run perf:timing:production [-- --since=30m]
 */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const since = (args.find((a) => a.startsWith("--since=")) ?? "--since=30m").split("=")[1];
const environment = (args.find((a) => a.startsWith("--env=")) ?? "--env=production").split("=")[1];

if (environment !== "production" && environment !== "preview") {
  console.error("\n[perf:timing] --env must be production or preview.\n");
  process.exit(1);
}

console.log(`\n[perf:timing] reading ${environment} logs, last ${since}\n`);

let raw = "";
try {
  // `shell: true` on Windows: npx is a .cmd shim, and execFileSync cannot spawn one directly (EINVAL).
  // Every argument here is a literal from this file — no user input reaches the command line.
  raw = execFileSync(
    "npx",
    ["vercel", "logs", "--environment", environment, "--since", since, "--query", "timing", "--limit", "200", "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" }
  );
} catch (err) {
  console.error(`[perf:timing] vercel logs failed: ${String(err?.message ?? err).split("\n")[0]}`);
  process.exit(1);
}

/** One request may carry several phase lines; each is parsed independently. */
const byPhase = new Map();
/** Phase occurrences per request id — this is what proves duplication. */
const perRequest = new Map();

for (const line of raw.split("\n")) {
  if (!line.startsWith("{")) continue;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  const path = entry.requestPath ?? "?";
  for (const log of entry.logs ?? []) {
    const match = /\[timing\] (\{.*\})/.exec(log.message ?? "");
    if (!match) continue;
    let t;
    try {
      t = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const key = `${t.phase}`;
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key).push(t.durationMs);

    const reqKey = `${entry.id}|${path}`;
    if (!perRequest.has(reqKey)) perRequest.set(reqKey, { path, phases: new Map() });
    const rec = perRequest.get(reqKey).phases;
    rec.set(key, (rec.get(key) ?? 0) + 1);
  }
}

if (!byPhase.size) {
  console.error(
    "[perf:timing] no [timing] lines found.\n" +
      "  Either MULEMARK_DIAGNOSTIC_TIMING is not '1' in that environment's RUNTIME (env changes need a\n" +
      "  redeploy to take effect), or no instrumented route was hit inside the window.\n"
  );
  process.exit(1);
}

const median = (a) => {
  const v = a.slice().sort((x, y) => x - y);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const ms = (n) => `${Math.round(n * 10) / 10} ms`;

console.log("| Phase | samples | median | min | max |");
console.log("|---|---|---|---|---|");
for (const [phase, xs] of [...byPhase.entries()].sort()) {
  console.log(`| ${phase} | ${xs.length} | ${ms(median(xs))} | ${ms(Math.min(...xs))} | ${ms(Math.max(...xs))} |`);
}

// Duplication: how many times each phase ran within a SINGLE request, by route.
const dupes = new Map();
for (const { path, phases } of perRequest.values()) {
  for (const [phase, count] of phases) {
    const k = `${path}|${phase}`;
    if (!dupes.has(k)) dupes.set(k, []);
    dupes.get(k).push(count);
  }
}
const repeated = [...dupes.entries()].filter(([, counts]) => Math.max(...counts) > 1);
if (repeated.length) {
  console.log("\n| Route | Phase | occurrences per request (max) |");
  console.log("|---|---|---|");
  for (const [k, counts] of repeated.sort()) {
    const [path, phase] = k.split("|");
    console.log(`| ${path} | ${phase} | **${Math.max(...counts)}** |`);
  }
  console.log("\nA phase appearing more than once in ONE request is repeated work, observed directly.");
} else {
  console.log("\nNo phase ran more than once within a single request in this window.");
}
console.log("");
