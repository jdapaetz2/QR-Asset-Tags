#!/usr/bin/env node
/**
 * Phase C0 performance baseline runner — one script, two environments.
 *
 * `npm run perf:baseline:production`  — read-only; measures the public routes and the authenticated
 *                                       routes of the approved Production QA organization ONLY.
 * `npm run perf:baseline:staging`     — same routes against staging, for comparison.
 *
 * TARGET SAFETY: `assertSmokeTarget` classifies the deployment from its HOST alone and refuses a
 * mismatch BEFORE the first request. Anything unrecognised is treated as production (fail closed).
 *
 * AUTHENTICATED ROUTES FAIL WITHOUT CREDENTIALS — they never skip. C0's whole point is that the
 * expensive routes get measured; a runner that quietly omits them produces a confident, useless report.
 *
 * PRODUCTION WRITES: none, except the `scan_events` row that any view of `/t/<code>` records. That is
 * why the scan route is measured only against the operator-approved QA short code. Action/mutation
 * benchmarks run on staging only and live in this script's staging mode.
 *
 * Usage: the two npm scripts above. `--env=production|staging` selects the mode.
 */
import { chromium, devices } from "playwright";

import { CANONICAL_PRODUCTION_ORIGIN, assertSmokeTarget } from "../lib/smoke-target.mjs";
import {
  COLLECT,
  WARMUP_NAVIGATIONS,
  WARM_SAMPLES,
  attachRequestMeter,
  createRun,
  regionOf,
} from "./lib/harness.mjs";

const args = process.argv.slice(2);
const MODE = (args.find((a) => a.startsWith("--env=")) ?? "").split("=")[1] ?? "";
if (MODE !== "production" && MODE !== "staging") {
  console.error("\n[perf] --env=production or --env=staging is required.\n");
  process.exit(1);
}
const IS_PROD = MODE === "production";

const BASE = (
  IS_PROD
    ? process.env.PRODUCTION_SMOKE_BASE_URL || CANONICAL_PRODUCTION_ORIGIN
    : process.env.QA_BASE_URL || ""
).replace(/\/+$/, "");

const SHORT_CODE = IS_PROD
  ? (process.env.PRODUCTION_QA_SHORT_CODE || "").trim()
  : "stg-qa-public";

const QA_EMAIL = IS_PROD
  ? (process.env.PRODUCTION_QA_EMAIL || "").trim()
  : "qa.admin@mulemark-staging.invalid";

const QA_PASSWORD = IS_PROD
  ? process.env.PRODUCTION_QA_PASSWORD || ""
  : process.env.STAGING_QA_PASSWORD || "";

const BYPASS = !IS_PROD && process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
  : {};

// ---- Target gate — before the first request ------------------------------------
let resolved;
try {
  resolved = assertSmokeTarget(MODE, BASE);
} catch (err) {
  console.error(`\n[perf:${MODE}] REFUSING TO RUN\n\n  ${err.message}\n`);
  process.exit(1);
}

// ---- Credential gate — authenticated routes must not silently skip --------------
if (!QA_PASSWORD || !QA_EMAIL) {
  console.error(
    `\n[perf:${MODE}] REFUSING TO RUN\n\n` +
      `  Authenticated routes cannot be measured without QA credentials, and this harness will not\n` +
      `  report them as "skipped" — that is how the expensive routes go unmeasured while the run\n` +
      `  still looks complete.\n\n` +
      `  Supply ${IS_PROD ? "PRODUCTION_QA_EMAIL + PRODUCTION_QA_PASSWORD" : "STAGING_QA_PASSWORD"} via the ignored env file.\n`
  );
  process.exit(1);
}
if (IS_PROD && !SHORT_CODE) {
  console.error(
    `\n[perf:production] REFUSING TO RUN\n\n` +
      `  PRODUCTION_QA_SHORT_CODE is not set. Viewing /t/ records a scan_events row, so the scan route\n` +
      `  is only ever measured against the approved QA asset — never a guessed or customer short code.\n`
  );
  process.exit(1);
}

const DEVICE_CLASSES = [
  { key: "mobile", descriptor: devices["Pixel 7"], cpuThrottle: 4 },
  { key: "desktop", descriptor: devices["Desktop Chrome"], cpuThrottle: 1 },
];

/**
 * Optional route filter, e.g. `--routes=dashboard` (Phase C9.1).
 *
 * WHY IT EXISTS AND WHY IT FILTERS BOTH LISTS. A dashboard-only benchmark must not visit `/t/<code>`,
 * because every view of that route WRITES a `scan_events` row — which is precisely one of the inputs the
 * dashboard then reads back over a 7-day window. Left unfiltered, the benchmark would inflate the thing
 * it is measuring, a little more on every run.
 *
 * So the filter is applied to the PUBLIC list as well as the authenticated one, and when no public route
 * survives, the anonymous block is skipped in full. The guarantee is structural rather than a convention
 * someone has to remember.
 */
const ROUTE_FILTER = (() => {
  const raw = (args.find((a) => a.startsWith("--routes=")) ?? "").split("=").slice(1).join("=").trim();
  if (!raw) return null;
  const keys = raw.split(",").map((k) => k.trim()).filter(Boolean);
  return keys.length > 0 ? new Set(keys) : null;
})();

const keepRoute = (route) => ROUTE_FILTER === null || ROUTE_FILTER.has(route.key);

const PUBLIC_ROUTES = [
  { key: "landing", path: "/", role: "anon" },
  { key: "public scan", path: `/t/${SHORT_CODE}`, role: "anon" },
  { key: "login", path: "/login", role: "anon" },
];

const AUTH_ROUTES = [
  { key: "dashboard", path: "/dashboard", role: "customer_admin" },
  { key: "assets", path: "/dashboard/assets", role: "customer_admin" },
  { key: "submissions", path: "/dashboard/submissions", role: "customer_admin" },
  { key: "rentals", path: "/dashboard/rentals", role: "customer_admin" },
  { key: "analytics", path: "/dashboard/analytics", role: "customer_admin" },
];

if (ROUTE_FILTER !== null) {
  const known = new Set([...PUBLIC_ROUTES, ...AUTH_ROUTES].map((r) => r.key));
  const unknown = [...ROUTE_FILTER].filter((k) => !known.has(k));
  if (unknown.length > 0) {
    console.error(
      `
[perf:${MODE}] REFUSING TO RUN

  --routes named ${unknown.join(", ")}, which is not a route key.
` +
        `  Known keys: ${[...known].join(", ")}.

` +
        `  Refusing rather than silently measuring nothing — an empty run that exits 0 reads as a pass.
`
    );
    process.exit(1);
  }
}

const run = createRun({
  environment: MODE,
  host: resolved.host,
  deploymentCommit: process.env.PERF_DEPLOYMENT_COMMIT || null,
});

console.log(`\n[perf:${MODE}] target verified: ${MODE.toUpperCase()} (${resolved.host})`);
console.log(`[perf:${MODE}] method: ${WARMUP_NAVIGATIONS} warm-ups discarded, ${WARM_SAMPLES} measured warm samples`);
console.log(`[perf:${MODE}] writes: ${IS_PROD ? "none beyond the scan_events row on the approved QA asset" : "bounded QA writes permitted"}\n`);

const browser = await chromium.launch();

async function newContext(cls) {
  const ctx = await browser.newContext({ ...cls.descriptor, extraHTTPHeaders: BYPASS });
  if (cls.cpuThrottle > 1) {
    // CPU throttling is a CDP capability; applied per page below.
    ctx.__cpuThrottle = cls.cpuThrottle;
  }
  return ctx;
}

async function applyThrottle(page, cls) {
  if (cls.cpuThrottle <= 1) return;
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cls.cpuThrottle });
  } catch {
    run.note(`CPU throttling unavailable for ${cls.key}; samples are unthrottled — recorded, not hidden.`);
  }
}

/** One measured navigation. Returns the row, or null when the navigation failed. */
async function measure({ context, cls, route, phase, idleMs = null }) {
  const page = await context.newPage();
  await applyThrottle(page, cls);
  const metered = attachRequestMeter(page);
  try {
    const t0 = Date.now();
    const response = await page.goto(`${BASE}${route.path}`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    // Browser navigation time is measured around the navigation ONLY. COLLECT waits a fixed 2 s for
    // LCP/CLS to settle, so evaluating it inside this window would add that 2 s to every "navigation"
    // number and quietly inflate the whole baseline.
    const navTotal = Date.now() - t0;
    metered.noteDocument(response);
    const vitals = await page.evaluate(COLLECT);
    return {
      deviceClass: cls.key,
      route: route.key,
      path: route.path,
      role: route.role,
      phase,
      idleMs,
      status: metered.meter.status,
      region: regionOf(metered.meter.vercelId),
      cache: metered.meter.cache,
      ttfb: vitals.ttfb,
      docStream: vitals.docStream,
      fcp: vitals.fcp,
      lcp: vitals.lcp,
      cls: vitals.cls,
      domContentLoaded: vitals.domContentLoaded,
      navTotal,
      requests: metered.meter.requests,
      bytes: metered.meter.bytes,
    };
  } catch (err) {
    run.fail(`${cls.key} ${route.key}: ${String(err?.message ?? err).split("\n")[0]}`);
    return null;
  } finally {
    metered.detach();
    await page.close();
  }
}

async function signIn(context, cls) {
  const page = await context.newPage();
  await applyThrottle(page, cls);
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByLabel("Email").fill(QA_EMAIL);
    await page.getByLabel("Password").fill(QA_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard|\/owner/, { timeout: 45_000 });
    return true;
  } catch (err) {
    run.fail(`${cls.key} sign-in: ${String(err?.message ?? err).split("\n")[0]}`);
    return false;
  } finally {
    await page.close();
  }
}

for (const cls of DEVICE_CLASSES) {
  run.note(`--- ${cls.key} ---`);

  // Public routes: anonymous context. Skipped ENTIRELY when the filter leaves none — that is what keeps
  // a dashboard-only run from ever touching /t/ and writing a scan_events row.
  const publicRoutes = PUBLIC_ROUTES.filter(keepRoute);
  if (publicRoutes.length === 0) {
    run.note(`${cls.key}: public routes skipped by --routes — no anonymous context, no scan events written`);
  } else {
    const ctx = await newContext(cls);
    for (const route of publicRoutes) {
      for (let i = 0; i < WARMUP_NAVIGATIONS; i++) await measure({ context: ctx, cls, route, phase: "warmup-discarded" });
      let ok = 0;
      for (let i = 0; i < WARM_SAMPLES; i++) {
        const row = await measure({ context: ctx, cls, route, phase: "warm" });
        if (row) {
          run.addSample(row);
          ok++;
        }
      }
      run.note(`${route.key}: ${ok}/${WARM_SAMPLES} warm samples`);
    }
    await ctx.close();
  }

  // Authenticated routes: one signed-in context reused, so login cost is not folded into route timings.
  {
    const ctx = await newContext(cls);
    const authed = await signIn(ctx, cls);
    if (!authed) {
      run.fail(`${cls.key}: authenticated routes NOT measured — sign-in failed. Coverage is incomplete.`);
    } else {
      const authRoutes = AUTH_ROUTES.filter(keepRoute);
      for (const route of authRoutes) {
        for (let i = 0; i < WARMUP_NAVIGATIONS; i++) await measure({ context: ctx, cls, route, phase: "warmup-discarded" });
        let ok = 0;
        for (let i = 0; i < WARM_SAMPLES; i++) {
          const row = await measure({ context: ctx, cls, route, phase: "warm" });
          if (row) {
            run.addSample(row);
            ok++;
          }
        }
        run.note(`${route.key}: ${ok}/${WARM_SAMPLES} warm samples`);
      }
    }
    await ctx.close();
  }
}

await browser.close();

const summary = run.summarise();
const files = run.write(summary);

console.log(`\n| Device | Route | n | Region | Shell TTFB | Server med | Server p75 | LCP med | LCP p75 | Nav med | Reqs |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
for (const s of summary) {
  const f = (x) => (x == null ? "—" : `${Math.round(x)} ms`);
  console.log(
    `| ${s.deviceClass} | ${s.route} | ${s.n} | ${s.region ?? "—"} | ${f(s.ttfb.median)} | ${f(s.docStream.median)} | ${f(s.docStream.p75)} | ${f(s.lcp.median)} | ${f(s.lcp.p75)} | ${f(s.navTotal.median)} | ${s.requests ?? "—"} |`
  );
}
console.log(`\nShell TTFB is the streamed shell flush — near-constant and NOT server work.`);
console.log(`Server = responseEnd - requestStart: when the stream closed, i.e. the server finished every await.`);
console.log(`\nartifacts: ${files.md}`);
console.log(`           ${files.json}`);
console.log(`\n${run.failures} failure(s), ${run.skips} skip(s).\n`);
process.exit(run.failures ? 1 : 0);
