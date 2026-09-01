#!/usr/bin/env node
/**
 * Production smoke (Phase B5) — READ-ONLY by default, and credential-free by design.
 *
 * WHAT THIS IS FOR: after a production deploy, answer "is the live product actually serving, and are its
 * guards still closed?" without touching a single customer record.
 *
 * NO CREDENTIALS. This script never reads a service-role key, a database password, or an anon key. Every
 * check is something an anonymous visitor can observe. That is deliberate: a post-deploy smoke run is
 * frequent and routine, and routine work should not carry the ability to read or write customer data.
 * Adding an elevated credential here needs a written justification, not a convenience argument.
 *
 * WHAT IT DOES NOT DO, and will not without explicit operator approval:
 *   - log in (there is no production QA account, and creating one is a production change);
 *   - submit any form;
 *   - send any email;
 *   - archive, delete, bulk-update, alter a plan, create a tag order, or touch lifecycle state.
 *
 * THE ONE WRITE THAT IS POSSIBLE, and why it is gated:
 *   `app/t/[shortCode]/page.tsx` calls `recordScan`, which INSERTS a `scan_events` row on every view. So
 *   loading a scan page is NOT read-only — it lands in that asset's analytics and last-scanned time.
 *   The scan check therefore runs ONLY against `PRODUCTION_SMOKE_SHORT_CODE`, an operator-designated
 *   test-only asset, and is SKIPPED (never silently passed) when that is unset. It never guesses a code.
 *
 * Usage:  npm run smoke:production
 * Env (optional, from the ignored .env.production-smoke.local):
 *   PRODUCTION_SMOKE_BASE_URL    defaults to the pinned canonical origin
 *   PRODUCTION_SMOKE_SHORT_CODE  a TEST-ONLY short code; omit to skip the scan check
 */
import { chromium } from "playwright";

import {
  CANONICAL_PRODUCTION_ORIGIN,
  ISOLATION_PROBE_SHORT_CODE,
  assertSmokeTarget,
} from "../lib/smoke-target.mjs";
import { createRun, visible } from "./lib/runner.mjs";

const BASE = (process.env.PRODUCTION_SMOKE_BASE_URL || CANONICAL_PRODUCTION_ORIGIN).replace(/\/+$/, "");
const SHORT_CODE = (process.env.PRODUCTION_SMOKE_SHORT_CODE || "").trim();

// ---- Target gate: refuse a non-production URL BEFORE any request is made ------
let resolved;
try {
  resolved = assertSmokeTarget("production", BASE);
} catch (err) {
  console.error(`\n[smoke:production] REFUSING TO RUN\n\n  ${err.message}\n`);
  process.exit(1);
}

console.log(`\n[smoke:production] target verified: PRODUCTION (${resolved.host})`);
console.log(`[smoke:production] read-only. No login, no form write, no email, no credentials.\n`);

const run = createRun({ label: "production", target: "PRODUCTION", host: resolved.host });
const browser = await chromium.launch();
const ctx = await browser.newContext();

/** GET without following redirects, so a redirect is observable rather than invisible. */
async function head(path) {
  const res = await ctx.request.get(`${BASE}${path}`, { maxRedirects: 0, failOnStatusCode: false });
  return { status: res.status(), location: res.headers()["location"] ?? "" };
}

// ---- Serving -----------------------------------------------------------------
{
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const ok = res?.status() === 200;
  run.check("serving", "landing page returns 200", ok, `http ${res?.status()}`);
  if (!ok) await run.capture(page, "landing");

  // The canonical origin must not leak a preview or localhost host into the served HTML — that would
  // mean a misconfigured NEXT_PUBLIC_SITE_URL, which is exactly what breaks permanent tags.
  const html = await page.content();
  run.check(
    "serving",
    "no vercel.app or localhost host in served HTML",
    !html.includes("vercel.app") && !html.includes("localhost")
  );
  await page.close();
}

{
  const login = await head("/login");
  run.check("serving", "login page reachable", login.status === 200, `http ${login.status}`);
}

// ---- Domain --------------------------------------------------------------------
{
  // www must redirect path-preservingly to the apex; tags encode the apex forever.
  try {
    const res = await ctx.request.get("https://www.mulemark.io/t/domain-smoke-probe", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    const loc = res.headers()["location"] ?? "";
    const redirects = res.status() >= 300 && res.status() < 400;
    run.check(
      "domain",
      "www redirects path-preservingly to the apex",
      redirects && loc.includes("mulemark.io/t/domain-smoke-probe") && !loc.includes("www."),
      `http ${res.status()} → ${loc}`
    );
  } catch (err) {
    run.fail("domain", "www redirects path-preservingly to the apex", err.message);
  }
}

// ---- Environment crossover (behavioural) ---------------------------------------
{
  // The staging-only probe exists in the staging database and nowhere else. If production resolves it,
  // production is reading staging — a far more serious finding than any single broken page.
  const page = await ctx.newPage();
  await page.goto(`${BASE}/t/${ISOLATION_PROBE_SHORT_CODE}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const unavailable = await visible(page.getByRole("heading", { name: /available/i }), 15_000);
  run.check(
    "isolation",
    "staging-only probe does NOT resolve on production",
    unavailable,
    unavailable ? "" : "production resolved a staging-only short code"
  );
  if (!unavailable) await run.capture(page, "isolation-probe");
  await page.close();
}

// ---- Public guards (anonymous) --------------------------------------------------
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/t/nonexistent-smoke-probe-code`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const notice = await visible(page.getByRole("heading", { name: /available/i }), 15_000);
  const body = (await page.content()).toLowerCase();
  run.check("public", "unknown tag shows the unavailable notice", notice);
  // The notice must not disclose WHY (archived vs unpublished vs suspended) — that is a tenant leak.
  run.check(
    "public",
    "unavailable notice discloses no reason",
    !body.includes("archived") && !body.includes("suspended") && !body.includes("unpublished")
  );
  if (!notice) await run.capture(page, "unknown-tag");
  await page.close();
}

// ---- Auth guards (anonymous) ----------------------------------------------------
for (const [name, path] of [
  ["dashboard", "/dashboard"],
  ["owner console", "/owner"],
  ["submissions", "/dashboard/submissions"],
]) {
  const r = await head(path);
  const guarded = r.status >= 300 && r.status < 400 && r.location.includes("/login");
  run.check("auth", `anonymous ${name} redirects to /login`, guarded, `http ${r.status} → ${r.location}`);
}

for (const [name, path] of [
  ["customer export download", "/dashboard/export/download?type=assets"],
  ["owner production QR svg", "/owner/production/qr.svg"],
  ["owner production CSV", "/owner/production/export.csv"],
]) {
  const r = await head(path);
  // Anything other than 200 is acceptable here; serving the bytes anonymously is the failure.
  run.check("auth", `anonymous ${name} is not served`, r.status !== 200, `http ${r.status}`);
}

// ---- Scan page (THE ONLY WRITE — gated on an operator-designated test asset) -----
if (!SHORT_CODE) {
  run.skip(
    "scan",
    "test-only scan page renders",
    "PRODUCTION_SMOKE_SHORT_CODE unset — loading /t/ writes a scan_events row, so this is never run against a guessed or customer asset"
  );
} else {
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/t/${SHORT_CODE}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const ok = res?.status() === 200;
  run.check("scan", "test-only scan page renders", ok, `http ${res?.status()}`);
  if (ok) {
    const html = await page.content();
    run.check("scan", "scan page carries no preview/localhost host", !html.includes("vercel.app") && !html.includes("localhost"));
  } else {
    await run.capture(page, "scan-page");
  }
  await page.close();
}

await browser.close();
process.exit(run.report() ? 0 : 1);
