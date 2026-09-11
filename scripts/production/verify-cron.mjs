/**
 * Engineering Phase D3B — fixed operator check for the Production daily-summary cron endpoint.
 *
 * What it proves, against https://mulemark.io:
 *   1. an unauthenticated request is refused (401);
 *   2. a wrong secret is refused (401);
 *   3. the real `CRON_SECRET` is accepted, and outside the 6 AM Pacific hour the worker does no work
 *      (200, outcome `outside_window`).
 *
 * SAFETY:
 *   - `CRON_SECRET` is read from `.env.production-cron.local` (git-ignored via `.env*`), never from a command argument,
 *     and is never printed.
 *   - It refuses to run during the 6 AM Pacific hour, when an authorized call would run the real summary.
 *   - Output is HTTP status codes and the bounded `outcome` value only.
 *
 * Run: `npm run cron:verify-production`
 */

const BASE = "https://mulemark.io";
const PATH = "/api/cron/return-digest";

function refuse(message) {
  console.error(`\n[cron:verify-production] REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(2);
}

function pacificHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Vancouver",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(hour) % 24;
}

const secret = process.env.CRON_SECRET ?? "";
if (secret.length < 32 || /[\r\n]/.test(secret)) {
  refuse("CRON_SECRET is not set to at least 32 characters in .env.production-cron.local (value never printed).");
}
if (pacificHour() === 6) {
  refuse("It is the 6 AM Pacific hour — an authorized call now would run the real daily summary. Try after 7 AM Pacific.");
}

console.log(`[cron:verify-production] target: ${BASE}${PATH} (read-only outside the 6 AM Pacific hour)\n`);

const results = [];

async function check(label, headers, expectedStatus, expectedOutcome) {
  let status = 0;
  let outcome = null;
  try {
    const res = await fetch(`${BASE}${PATH}`, { headers, redirect: "manual", cache: "no-store" });
    status = res.status;
    try {
      const body = await res.json();
      outcome = typeof body?.outcome === "string" ? body.outcome : null;
    } catch {
      outcome = null;
    }
  } catch {
    status = 0;
  }
  const ok = status === expectedStatus && (expectedOutcome === undefined || outcome === expectedOutcome);
  results.push({ label, status, outcome, ok });
}

await check("unauthenticated request is refused", {}, 401);
await check("a wrong secret is refused", { authorization: `Bearer ${"x".repeat(40)}` }, 401);
await check(
  "the configured secret is accepted and does no work outside the 6 AM hour",
  { authorization: `Bearer ${secret}` },
  200,
  "outside_window"
);

for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.label} — http ${r.status}${r.outcome ? `, outcome ${r.outcome}` : ""}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length} checks — ${results.length - failed} pass, ${failed} fail.`);
process.exit(failed ? 1 : 0);
