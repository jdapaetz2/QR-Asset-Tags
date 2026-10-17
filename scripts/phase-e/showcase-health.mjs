#!/usr/bin/env node
/**
 * Engineering Phase E1 — read-only health check of the protected showcase routes. Scan-free; no credentials.
 *
 *   npm.cmd run phase-e:health:production
 *   npm.cmd run phase-e:health:production -- --host=qr-asset-tags.vercel.app
 *
 * For each protected route in docs/phase-e/manifests/protected-demo-routes.json it GETs https://<host>/nojs/t/<code>
 * (app/nojs/t/[shortCode]/page.tsx renders with recordScan={false}, so no scan row is written) and requires HTTP 200,
 * no unavailable notice and the route's asset code on the page. The disabled demo-comp003 must stay unavailable. On the
 * Vercel alias the conditional 2026-07-20 sheet's codes are checked too. `/t/` itself is never requested, redirects are
 * not followed, and response bodies are inspected in memory only — never printed or saved (a resolved page can carry
 * signed document URLs). This is the "read-only showcase health check" QA isolation keeps separate from QA runners.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { publicRouteVerdict } from "../lib/staging-probe.mjs";

const TAG = "[health]";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/manifests/protected-demo-routes.json"), "utf8"));
const HOSTS = new Set(["mulemark.io", "qr-asset-tags.vercel.app"]);
const TIMEOUT_MS = 20_000;

function refuse(message, code = 2) {
  console.error(`\n${TAG} REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(code);
}

let host = "mulemark.io";
for (const raw of process.argv.slice(2)) {
  const m = /^--host=(.+)$/.exec(raw);
  if (!m) refuse(`unknown argument ${JSON.stringify(String(raw).split("=")[0].slice(0, 40))}`);
  host = m[1].trim().toLowerCase();
}
if (!HOSTS.has(host)) refuse(`--host must be one of ${[...HOSTS].join(", ")}`);

const checks = [
  ...REGISTRY.routes.map((r) => ({ code: r.short_code, assetCode: r.asset_code_label, expectResolves: true, label: "protected" })),
  ...REGISTRY.other_northridge_qr_rows
    .filter((r) => r.status === "disabled")
    .map((r) => ({ code: r.short_code, assetCode: null, expectResolves: false, label: "disabled" })),
];
if (host === "qr-asset-tags.vercel.app") {
  for (const sheet of REGISTRY.conditional_routes ?? []) {
    for (const symbol of sheet.symbols ?? []) {
      const code = /\/t\/([^/?#]+)$/.exec(symbol.decoded_url ?? "")?.[1];
      if (code && !checks.some((c) => c.code === code)) checks.push({ code, assetCode: symbol.label ?? null, expectResolves: true, label: "conditional" });
    }
  }
}

async function check({ code, assetCode, expectResolves }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://${host}/nojs/t/${encodeURIComponent(code)}`, { redirect: "manual", signal: controller.signal });
    return publicRouteVerdict({ status: res.status, body: await res.text(), assetCode, expectResolves });
  } catch (err) {
    return { ok: false, resolved: null, reason: `request failed (${String(err?.name ?? "error")})` };
  } finally {
    clearTimeout(timer);
  }
}

// Protected routes and the disabled code gate the run. Conditional codes (protected only if the 2026-07-20 sheet was
// printed — an open operator question) are reported as notes, not failures.
console.log(`\n${TAG} ${host} — scan-free /nojs/t/ checks of the protected showcase routes (read-only)`);
let failures = 0;
let notes = 0;
for (const c of checks) {
  const verdict = await check(c);
  const conditional = c.label === "conditional";
  if (!verdict.ok && conditional) notes++;
  else if (!verdict.ok) failures++;
  console.log(`  ${verdict.ok ? "OK  " : conditional ? "NOTE" : "FAIL"} ${c.label.padEnd(11)} ${c.code.padEnd(14)} ${verdict.reason}`);
}
const gating = checks.filter((c) => c.label !== "conditional").length;
console.log(`${TAG} ${gating - failures}/${gating} gating checks passed${notes ? ` · ${notes} conditional code(s) noted` : ""}\n`);
process.exitCode = failures === 0 ? 0 : 1;
