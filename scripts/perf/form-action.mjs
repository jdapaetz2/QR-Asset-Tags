#!/usr/bin/env node
/**
 * Phase C6 — public form ACTION latency. The half of the baseline C0 never built.
 *
 * C0 §6 says plainly: "Action latency — Not measured in C0 … It is the first task of whichever slice
 * runs next." The navigation harness measures page loads; it cannot see a form POST. C6's whole decision
 * — whether the provider call belongs on the renter's critical path — rests on numbers that did not
 * exist, so this produces them.
 *
 * WHAT IT MEASURES, per submission: submit click → POST completes → confirmation rendered, with the
 * canonical reference (SUB-YYYY-XXXXXX) asserted on the thanks page. **A run that does not reach a
 * reference is recorded as a FAILURE, never timed as a success** — the failure mode that would otherwise
 * make a broken form look fast.
 *
 * The pre-commit boundary is derived, not separately instrumented: `POST duration − notify.send`. It is
 * reported as a derivation so nobody later quotes it as a directly measured phase.
 *
 * NO-MEDIA AND SMALL-MEDIA are measured separately, because upload dominates the second and would
 * otherwise hide the notification cost in the first.
 *
 * TARGETING is fail-closed via `assertSmokeTarget`. Production is permitted ONLY with an explicit
 * `--production-qa` flag plus a short code, because a submission there writes a real row and — when the
 * organization has a recipient — triggers a real provider call.
 *
 * Usage:
 *   QA_BASE_URL=<preview> node --env-file=.env.staging.local scripts/perf/form-action.mjs --samples=8
 *   node --env-file=.env.production-perf.local scripts/perf/form-action.mjs --env=production \
 *     --production-qa --short-code=<code> --samples=6
 */
import { chromium } from "playwright";

import { assertSmokeTarget } from "../lib/smoke-target.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback = "") =>
  (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=").slice(1).join("=");

const MODE = flag("env", "staging");
const SAMPLES = Math.max(1, Math.min(50, Number(flag("samples", "5")) || 5));
/**
 * PACING IS MANDATORY, NOT POLITENESS. Public intake is rate limited per (action, ip, short code):
 * damage/support text is 5/min and 30/hour, and WITH MEDIA only 3/min and 15/hour
 * (lib/ratelimit/policy.ts). An unpaced run trips the limiter, and a limited request returns an error
 * state that this harness would otherwise have to score as a failure — measuring the limiter instead of
 * the form. Default 22 s keeps both shapes inside their per-minute burst window.
 *
 * The HOURLY caps still bind across runs: a before/after pair at 5 samples each spends 12 of the 15
 * media requests available in an hour. Space the two runs, or the second one measures rejections.
 */
const INTERVAL_MS = Math.max(0, Number(flag("interval-ms", "22000")) || 22000);
const IS_PROD = MODE === "production";
const PRODUCTION_QA = args.includes("--production-qa");

const BASE = (
  IS_PROD ? process.env.PRODUCTION_SMOKE_BASE_URL || "https://mulemark.io" : process.env.QA_BASE_URL || ""
).replace(/\/+$/, "");
const SHORT_CODE = IS_PROD
  ? (flag("short-code") || process.env.PRODUCTION_QA_SHORT_CODE || "").trim()
  : flag("short-code", "stg-qa-public");
const BYPASS = !IS_PROD && process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
  : {};

function refuse(message, hints = []) {
  console.error(`\n[form-action] REFUSING TO RUN\n\n  ${message}`);
  for (const h of hints) console.error(`  ${h}`);
  console.error("");
  process.exit(1);
}

if (MODE !== "production" && MODE !== "staging") refuse("--env must be production or staging.");
if (!BASE) refuse("No base URL. Set QA_BASE_URL (staging) or PRODUCTION_SMOKE_BASE_URL (production).");
if (!SHORT_CODE) refuse("No short code supplied.");

let site;
try {
  site = assertSmokeTarget(MODE, BASE);
} catch (err) {
  refuse(err.message);
}

// Production submits write a real row and may trigger a real provider send. That needs an explicit,
// deliberate flag — never a default, and never inferable from an env file alone.
if (IS_PROD && !PRODUCTION_QA) {
  refuse(
    "A production run submits real forms against the QA asset and can trigger a live provider send.",
    ["Pass --production-qa to confirm you intend that, together with --short-code=<approved QA code>."]
  );
}

console.log(`\n[form-action] ${MODE.toUpperCase()} (${site.host}), short code ${SHORT_CODE}, ${SAMPLES} samples per shape\n`);

/** A 1×1 PNG — the smallest real image, so "small media" measures upload overhead, not payload size. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Matches tests/e2e/public/forms.spec.ts — the canonical reference the admin inbox also shows. */
const REFERENCE_RE = /SUB-\d{4}-[0-9A-F]{6}/;

const median = (xs) => {
  const v = xs.slice().sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const pct = (xs, p) => {
  const v = xs.slice().sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))];
};
const ms = (n) => `${Math.round(n)} ms`;
const sleep = (n) => new Promise((r) => setTimeout(r, n));

/** Renter-facing copy from lib/ratelimit/policy.ts — recognised so a limited run is never scored as slow. */
const RATE_LIMITED_TEXT = "Too many attempts right now";

async function measureOne(context, withMedia) {
  const page = await context.newPage();
  const timings = { postMs: null, confirmMs: null, ok: false };
  try {
    await page.goto(`${BASE}/forms/${SHORT_CODE}/damage`, { waitUntil: "domcontentloaded" });

    // Selectors mirror tests/e2e/support/actions.ts#submitDamage so the harness and the E2E suite
    // cannot drift into exercising different things.
    await page.getByLabel("Your name").fill("C6 Probe");
    await page.getByRole("textbox", { name: "Email" }).fill("c6-probe@example.test");
    await page.getByLabel("What's damaged?").fill("C6 action-latency probe — automated measurement.");
    if (withMedia) {
      await page.locator('input[name="media"]').setInputFiles({
        name: "probe.png",
        mimeType: "image/png",
        buffer: TINY_PNG,
      });
    }

    const submit = page.getByRole("button", { name: "Submit damage report" });

    const clickedAt = Date.now();
    // The server action POST. Its duration is the server-side cost the renter actually waits through.
    const postPromise = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes(`/forms/${SHORT_CODE}/`),
      { timeout: 60_000 }
    );
    await submit.click();
    await postPromise;
    timings.postMs = Date.now() - clickedAt;

    // A limited request never reaches /thanks. Detect it explicitly and label it, rather than letting it
    // time out and be filed under the same heading as a genuine failure.
    if (await page.getByText(RATE_LIMITED_TEXT).first().isVisible().catch(() => false)) {
      timings.rateLimited = true;
      return timings;
    }

    // Confirmation is only confirmation if the canonical reference is on the page.
    await page.waitForURL(/\/thanks/, { timeout: 60_000 });
    await page.getByText(REFERENCE_RE).first().waitFor({ state: "visible", timeout: 30_000 });
    timings.confirmMs = Date.now() - clickedAt;
    // Success is the reference being on the page. Not a status code — a server action can answer 200
    // with an error state, and timing that as a fast success is precisely the trap this avoids.
    timings.ok = true;
  } catch (err) {
    timings.error = String(err?.message ?? err).split("\n")[0];
  } finally {
    await page.close();
  }
  return timings;
}

const browser = await chromium.launch();
const context = await browser.newContext({ extraHTTPHeaders: BYPASS });

const rows = [];
for (const shape of [
  { key: "no media", withMedia: false },
  { key: "small media (1 image)", withMedia: true },
]) {
  const post = [];
  const confirm = [];
  let failures = 0;
  const errors = [];

  // One discarded warm-up per shape: the first submit pays route compilation and connection setup, and
  // including it would inflate the median with a cost no real renter pays twice.
  await measureOne(context, shape.withMedia);

  let limited = 0;
  for (let i = 0; i < SAMPLES; i++) {
    if (i > 0) await sleep(INTERVAL_MS);
    const t = await measureOne(context, shape.withMedia);
    if (t.rateLimited) {
      limited++;
      continue;
    }
    if (!t.ok || t.confirmMs === null) {
      failures++;
      if (t.error) errors.push(t.error);
      continue;
    }
    post.push(t.postMs);
    confirm.push(t.confirmMs);
  }
  rows.push({ shape: shape.key, post, confirm, failures, errors, limited });
  console.log(
    `  ${shape.key}: ${post.length}/${SAMPLES} measured` +
      `${limited ? `, ${limited} RATE-LIMITED (not timed)` : ""}${failures ? `, ${failures} FAILED` : ""}`
  );
}

await context.close();
await browser.close();

console.log("\n| Shape | n | POST med | POST p75 | POST max | Click→confirm med | Click→confirm max |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  if (r.post.length === 0) {
    console.log(`| ${r.shape} | 0 | — | — | — | — | — |`);
    continue;
  }
  console.log(
    `| ${r.shape} | ${r.post.length} | ${ms(median(r.post))} | ${ms(pct(r.post, 75))} | ${ms(Math.max(...r.post))} | ` +
      `${ms(median(r.confirm))} | ${ms(Math.max(...r.confirm))} |`
  );
}

const totalLimited = rows.reduce((n, r) => n + r.limited, 0);
if (totalLimited > 0) {
  console.log(
    `
${totalLimited} submission(s) were RATE-LIMITED and excluded. They are not slow submissions —
` +
      "  raise --interval-ms, lower --samples, or wait out the hourly cap (media: 15/hour)."
  );
}

const totalFailures = rows.reduce((n, r) => n + r.failures, 0);
if (totalFailures > 0) {
  console.log(`\n${totalFailures} submission(s) FAILED and were excluded — these are not "slow", they are broken:`);
  for (const r of rows) for (const e of new Set(r.errors)) console.log(`  ${r.shape}: ${e}`);
}
console.log(
  "\nPOST duration is what the renter waits through. The pre-commit boundary is DERIVED as\n" +
    "(POST − notify.send); read notify.send from the timing logs, not from this table.\n"
);
process.exit(totalFailures > 0 ? 1 : 0);
