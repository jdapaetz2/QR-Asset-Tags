#!/usr/bin/env node
/**
 * A6.3 performance baseline — LAB Web Vitals against a staging deployment.
 *
 * WHAT THIS IS: scripted, synthetic ("lab") measurement from ONE machine on ONE network, with a small
 * sample. It is a staging baseline for spotting regressions and gross outliers.
 *
 * WHAT THIS IS NOT: field data, and not a production-domain certification. Vercel Speed Insights collects
 * the real field distribution (p75 across real users/devices/networks) and needs real traffic; nothing
 * here substitutes for it. Do not quote these numbers as production performance.
 *
 * Metrics: TTFB + FCP + LCP + CLS via PerformanceObserver/Navigation Timing. INP is reported ONLY when a
 * scripted interaction actually produces an `event` entry with a duration — otherwise it is recorded as
 * "not captured" rather than guessed. (Real INP is a field metric; a scripted click is a weak proxy.)
 *
 * Usage:
 *   node scripts/qa/staging-vitals.mjs --base=https://<staging> [--samples=5] [--json=out.json]
 * Env (optional): VERCEL_AUTOMATION_BYPASS_SECRET — sent as a header so an SSO-protected preview is
 * reachable. Read from env only; never printed, never written to output.
 */
import { writeFileSync } from "node:fs";

import { chromium, devices } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  })
);

const BASE = String(args.base || "").replace(/\/$/, "");
if (!BASE) {
  console.error("usage: staging-vitals.mjs --base=https://<staging> [--samples=5]");
  process.exit(1);
}
const SAMPLES = Number(args.samples ?? 5);
/** Optional substring filter, e.g. `--only=evidence`, to re-measure one route without a full re-run. */
const ONLY = args.only ? String(args.only).toLowerCase() : null;
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const SHORT_CODE = process.env.QA_SHORT_CODE || "qa-a63-test";

/** Device classes. "mobile" adds CPU throttling to approximate a mid-range handset. */
const CLASSES = [
  { key: "mobile", descriptor: devices["Pixel 7"], cpuThrottle: 4 },
  { key: "desktop", descriptor: devices["Desktop Chrome"], cpuThrottle: 1 },
];

/** Routes. `auth` routes need a signed-in admin; they are skipped unless creds are supplied. */
const ROUTES = [
  { key: "public scan", path: `/t/${SHORT_CODE}`, auth: false },
  { key: "damage form", path: `/forms/${SHORT_CODE}/damage`, auth: false },
  { key: "renter return checklist", path: `/forms/${SHORT_CODE}/return`, auth: false },
  { key: "login", path: "/login", auth: false },
  { key: "dashboard", path: "/dashboard", auth: true },
  { key: "assets", path: "/dashboard/assets", auth: true },
  { key: "submissions", path: "/dashboard/submissions", auth: true },
  { key: "rentals", path: "/dashboard/rentals", auth: true },
  { key: "session evidence (photos)", path: process.env.QA_EVIDENCE_PATH || "", auth: true },
];

/**
 * Collected in-page. Resolves once the load settles so LCP/CLS have final-ish values.
 * Must be an IIFE: `page.evaluate` treats a string as an EXPRESSION, so a bare arrow function would
 * evaluate to the function itself (unserializable → undefined) instead of running it.
 */
const COLLECT = `(() => new Promise((resolve) => {
  const out = { ttfb: null, fcp: null, lcp: null, cls: 0, inp: null };
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) out.ttfb = nav.responseStart;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') out.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      const es = l.getEntries();
      if (es.length) out.lcp = es[es.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) out.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        const d = e.duration || 0;
        if (d > (out.inp ?? 0)) out.inp = d;
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch { /* older engines: partial metrics, reported as null */ }
  setTimeout(() => resolve(out), 2500);
}))()`;

const median = (xs) => {
  const v = xs.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const range = (xs) => {
  const v = xs.filter((n) => typeof n === "number" && Number.isFinite(n));
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};
const ms = (n) => (n == null ? "—" : `${Math.round(n)} ms`);

async function signIn(context) {
  const email = process.env.QA_ADMIN_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) return false;
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard|\/owner/, { timeout: 30_000 }).catch(() => {});
  await page.close();
  return true;
}

const results = [];

for (const cls of CLASSES) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...cls.descriptor,
    // Bypass header only — adding `x-vercel-set-bypass-cookie` triggers a set-cookie redirect loop.
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {},
  });
  const authed = await signIn(context);

  for (const route of ROUTES) {
    if (!route.path) continue;
    if (ONLY && !route.key.toLowerCase().includes(ONLY)) continue;
    if (route.auth && !authed) {
      results.push({ class: cls.key, route: route.key, skipped: "no QA credentials supplied" });
      continue;
    }
    const samples = [];
    for (let i = 0; i < SAMPLES; i++) {
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      if (cls.cpuThrottle > 1) await session.send("Emulation.setCPUThrottlingRate", { rate: cls.cpuThrottle });
      try {
        const resp = await page.goto(`${BASE}${route.path}`, { waitUntil: "load", timeout: 45_000 });
        if (resp && resp.status() >= 400) {
          samples.push({ error: `HTTP ${resp.status()}` });
        } else {
          // One scripted interaction so an `event` entry can exist for the INP proxy.
          await page.mouse.click(5, 5).catch(() => {});
          const m = await page.evaluate(COLLECT);
          samples.push(m && typeof m === "object" ? m : { error: "no metrics returned" });
        }
      } catch (e) {
        samples.push({ error: e.message.slice(0, 80) });
      }
      await page.close();
    }
    const ok = samples.filter((s) => !s.error);
    results.push({
      class: cls.key,
      route: route.key,
      path: route.path,
      n: ok.length,
      errors: samples.length - ok.length,
      ttfb: median(ok.map((s) => s.ttfb)),
      fcp: median(ok.map((s) => s.fcp)),
      lcp: median(ok.map((s) => s.lcp)),
      cls: median(ok.map((s) => s.cls)),
      inp: median(ok.map((s) => s.inp)),
      lcpRange: range(ok.map((s) => s.lcp)),
    });
    process.stderr.write(`  measured ${cls.key} ${route.key} (n=${ok.length})\n`);
  }
  await browser.close();
}

console.log(`\nStaging Web Vitals — LAB data, ${SAMPLES} samples/route, base=${BASE}\n`);
console.log("| Device class | Route | n | TTFB | FCP | LCP (median) | LCP range | CLS | INP proxy |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  if (r.skipped) {
    console.log(`| ${r.class} | ${r.route} | — | — | — | — | — | — | skipped: ${r.skipped} |`);
    continue;
  }
  const lcpR = r.lcpRange ? `${Math.round(r.lcpRange[0])}–${Math.round(r.lcpRange[1])} ms` : "—";
  const inp = r.inp == null ? "not captured" : ms(r.inp);
  console.log(
    `| ${r.class} | ${r.route} | ${r.n}${r.errors ? ` (+${r.errors} err)` : ""} | ${ms(r.ttfb)} | ${ms(r.fcp)} | ${ms(r.lcp)} | ${lcpR} | ${r.cls == null ? "—" : r.cls.toFixed(3)} | ${inp} |`
  );
}
console.log("\nLab data from one machine/network. Not field data; not a production-domain result.");

if (args.json) writeFileSync(String(args.json), JSON.stringify({ base: BASE, samples: SAMPLES, results }, null, 2));
