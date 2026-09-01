#!/usr/bin/env node
/**
 * Staging smoke (Phase B5). Exercises the golden paths against the deployed Preview using the
 * deterministic fixtures from seed-staging-qa.mjs. Supersedes verify-staging-workflows.mjs (B1B), whose
 * checks are carried forward here plus a target gate, failure artifacts, sign-out, the damage form, the
 * acknowledgement, and a notification dry-run assertion.
 *
 * BOUNDED WRITES ARE ALLOWED HERE, and only here. Staging exists to receive them. Every write lands in
 * the two seeded QA organizations and is repeatable — running this twice must leave staging in the same
 * shape it started in.
 *
 * WHAT IS DELIBERATELY READ-ONLY, and why it matters:
 *   The outbound and staff-return workflows are checked for REACHABILITY AND GUARDS ONLY. Driving them
 *   to completion mutates `assets.active_rental_session_id` — closing the rental session on the rented
 *   fixture. The very next run's acknowledgement check depends on that session being open, so a
 *   "complete" smoke run would silently break its own fixtures and produce a false failure tomorrow.
 *   Those transitions belong to the local E2E suite, which reseeds between runs. A smoke suite that
 *   degrades the environment it measures is worse than no smoke suite.
 *
 * NEVER PRINTS the bypass secret or the QA password. All inputs come from the environment via
 * `--env-file=.env.staging.local`, never from argv.
 *
 * Usage: npm run smoke:staging
 */
import { chromium } from "playwright";

import { ISOLATION_PROBE_SHORT_CODE, assertSmokeTarget } from "../lib/smoke-target.mjs";
import { bypassHeaders, createRun, hasBypass, visible } from "./lib/runner.mjs";

const BASE = (process.env.QA_BASE_URL || process.env.STAGING_BASE_URL || "").replace(/\/+$/, "");
const PW = process.env.STAGING_QA_PASSWORD || process.env.QA_PASSWORD || "";

const ACCT = {
  owner: "qa.owner@mulemark-staging.invalid",
  admin: "qa.admin@mulemark-staging.invalid",
  staff: "qa.staff@mulemark-staging.invalid",
  orgb: "qa.admin.orgb@mulemark-staging.invalid",
};

// A run marker so rows written by smoke are identifiable in the staging inbox. Time-based, not random,
// so it sorts; it carries no secret.
const MARKER = `B5 smoke ${new Date().toISOString().slice(0, 16)}`;

// ---- Target gate: refuse a non-staging URL BEFORE any request is made ---------
let resolved;
try {
  resolved = assertSmokeTarget("staging", BASE);
} catch (err) {
  console.error(`\n[smoke:staging] REFUSING TO RUN\n\n  ${err.message}\n`);
  console.error("  Set QA_BASE_URL to the stable Preview URL in .env.staging.local.\n");
  process.exit(1);
}
if (!PW) {
  console.error("\n[smoke:staging] REFUSING TO RUN\n\n  STAGING_QA_PASSWORD is not set (.env.staging.local).\n");
  process.exit(1);
}

console.log(`\n[smoke:staging] target verified: STAGING (${resolved.host})`);
console.log(`[smoke:staging] deployment-protection bypass: ${hasBypass() ? "configured" : "not configured"}`);
console.log(`[smoke:staging] bounded writes: submissions + acknowledgement on the seeded QA orgs only.\n`);

const run = createRun({ label: "staging", target: "STAGING", host: resolved.host });
const browser = await chromium.launch();
const newCtx = () => browser.newContext({ extraHTTPHeaders: bypassHeaders() });

/**
 * Run one check's interactions, converting an unexpected throw (a changed selector, a timeout) into a
 * recorded FAIL. Without this, one moved label aborts the whole run and the remaining checks report
 * nothing at all — which reads as "we don't know" when it should read as "one thing broke".
 */
async function guard(area, check, fn) {
  try {
    return await fn();
  } catch (err) {
    run.fail(area, check, String(err?.message ?? err).split("\n")[0]);
    return null;
  }
}

async function login(context, email) {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PW);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard|\/owner/, { timeout: 45_000 });
    return true;
  } catch {
    await run.capture(page, `login-${email.split("@")[0]}`);
    return false;
  } finally {
    await page.close();
  }
}

// ---- Environment crossover (behavioural) ---------------------------------------
{
  const c = await newCtx();
  const page = await c.newPage();
  const res = await page.goto(`${BASE}/t/${ISOLATION_PROBE_SHORT_CODE}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  // The mirror of the production check: staging MUST resolve the staging-only probe. If it does not,
  // this deployment is reading some other database and every result below is meaningless.
  const ok = res?.status() === 200 && !(await visible(page.getByRole("heading", { name: /available/i }), 5_000));
  run.check("isolation", "staging resolves the staging-only probe", ok, `http ${res?.status()}`);
  if (!ok) await run.capture(page, "isolation-probe");
  await page.close();
  await c.close();
}

// ---- Public --------------------------------------------------------------------
{
  const c = await newCtx();

  let p = await c.newPage();
  const r = await p.goto(`${BASE}/t/stg-qa-public`, { waitUntil: "load", timeout: 60_000 });
  const named = await visible(p.getByText("Staging QA Trailer", { exact: false }));
  run.check("public", "scan page renders", r?.status() === 200 && named, `http ${r?.status()}`);
  run.check(
    "public",
    "no horizontal overflow",
    await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1)
  );
  if (!named) await run.capture(p, "scan-public");
  await p.close();

  p = await c.newPage();
  await p.goto(`${BASE}/t/stg-qa-disabled`, { waitUntil: "load", timeout: 60_000 });
  run.check("public", "disabled QR shows unavailable", await visible(p.getByRole("heading", { name: /available/i })));
  await p.close();

  // WRITE: support submission → form_submissions INSERT
  await guard("public", "support form submits + shows reference", async () => {
    const page = await c.newPage();
    await page.goto(`${BASE}/forms/stg-qa-public/support`, { waitUntil: "load", timeout: 60_000 });
    await page.getByLabel("Your name").fill(MARKER);
    await page.getByRole("textbox", { name: "Email" }).fill("smoke@mulemark-staging.invalid");
    await page.getByLabel("What do you need help with?").fill(`${MARKER} — automated staging smoke, not a real request.`);
    await page.getByRole("button", { name: "Send support request" }).click();
    await page.waitForURL(/thanks/, { timeout: 60_000 }).catch(() => {});
    const ok = await visible(page.getByText(/^SUB-\d{4}-[0-9A-F]{6}$/));
    run.check("public", "support form submits + shows reference", ok);
    if (!ok) await run.capture(page, "support-form");
    await page.close();
  });

  // WRITE: damage submission → form_submissions INSERT
  await guard("public", "damage form submits + shows reference", async () => {
    const page = await c.newPage();
    await page.goto(`${BASE}/forms/stg-qa-public/damage`, { waitUntil: "load", timeout: 60_000 });
    await page.getByLabel("Your name").fill(MARKER);
    await page.getByRole("textbox", { name: "Email" }).fill("smoke@mulemark-staging.invalid");
    // Label is "What's damaged?" — kept in step with tests/e2e/support/actions.ts#submitDamage.
    await page.getByLabel("What's damaged?").fill(`${MARKER} — automated staging smoke, no real damage.`);
    await page.getByRole("button", { name: "Submit damage report" }).click();
    await page.waitForURL(/thanks/, { timeout: 60_000 }).catch(() => {});
    const ok = await visible(page.getByText(/^SUB-\d{4}-[0-9A-F]{6}$/));
    run.check("public", "damage form submits + shows reference", ok);
    if (!ok) await run.capture(page, "damage-form");
    await page.close();
  });

  p = await c.newPage();
  await p.goto(`${BASE}/forms/stg-qa-public/return`, { waitUntil: "load", timeout: 60_000 });
  run.check("public", "renter return checklist stage 1", await visible(p.getByText("Step 1 of 3")));
  await p.close();

  p = await c.newPage();
  await p.goto(`${BASE}/t/stg-qa-rented`, { waitUntil: "load", timeout: 60_000 });
  run.check(
    "public",
    "acknowledgement prompt on an active session",
    await visible(p.getByRole("dialog", { name: "Before you use this equipment" }), 20_000)
  );
  await p.close();
  await c.close();
}

// ---- Owner ---------------------------------------------------------------------
{
  const c = await newCtx();
  const ok = await login(c, ACCT.owner);
  run.check("owner", "login", ok);
  if (ok) {
    const p = await c.newPage();
    await p.goto(`${BASE}/owner`, { waitUntil: "load", timeout: 60_000 });
    run.check("owner", "organizations list", await visible(p.getByRole("heading", { name: "Organizations" })));
    await p.close();
  }
  await c.close();
}

// ---- Customer admin ------------------------------------------------------------
{
  const c = await newCtx();
  const ok = await login(c, ACCT.admin);
  run.check("admin", "login", ok);
  if (ok) {
    for (const [label, path, heading] of [
      ["assets", "/dashboard/assets", "Assets"],
      ["submissions", "/dashboard/submissions", "Submissions"],
      ["rentals", "/dashboard/rentals", "Rental sessions"],
    ]) {
      const p = await c.newPage();
      await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 });
      const seen = await visible(p.getByRole("heading", { name: heading }));
      run.check("admin", label, seen);
      if (!seen) await run.capture(p, `admin-${label}`);
      await p.close();
    }

    // The submission this run just wrote must be visible to the admin — proof the write landed in the
    // right tenant, not merely that the form returned a thanks page.
    const s = await c.newPage();
    await s.goto(`${BASE}/dashboard/submissions`, { waitUntil: "load", timeout: 60_000 });
    run.check("admin", "smoke submission appears in the inbox", await visible(s.getByText(MARKER).first(), 15_000));
    await s.close();

    const p = await c.newPage();
    await p.goto(`${BASE}/dashboard/export`, { waitUntil: "load", timeout: 60_000 });
    await p.waitForURL(/\/dashboard\/settings/, { timeout: 15_000 }).catch(() => {});
    run.check("admin", "export DISABLED redirects to settings", /\/dashboard\/settings/.test(p.url()), p.url().replace(BASE, ""));
    await p.close();

    const q = await c.newPage();
    await q.goto(`${BASE}/dashboard/assets`, { waitUntil: "load", timeout: 60_000 });
    run.check("cross-tenant", "org-A admin cannot see an org-B asset", (await q.getByText("STG-QB-PUB").count()) === 0);
    await q.close();

    // Sign out, and confirm the session is really gone rather than merely navigated away from.
    await guard("admin", "sign out clears the session", async () => {
    const o = await c.newPage();
    await o.goto(`${BASE}/dashboard`, { waitUntil: "load", timeout: 60_000 });
    // The account menu is a hydrated Radix dropdown. Open it with the keyboard (deterministic — a
    // click can land before hydration) and re-press until the item appears, bounded by a deadline.
    // Mirrors tests/e2e/smoke/sign-out.spec.ts so the two cannot drift.
    const trigger = o.getByRole("button", { name: "Account menu" });
    const signOut = o.getByRole("menuitem", { name: "Sign out" });
    const deadline = Date.now() + 20_000;
    let opened = false;
    while (Date.now() < deadline && !opened) {
      await trigger.press("Enter").catch(() => {});
      opened = await visible(signOut, 1_500);
    }
    if (opened) {
      await signOut.click();
      await o.waitForURL(/\/login/, { timeout: 30_000 }).catch(() => {});
      // Navigating back must not restore the session — that is the actual guarantee under test.
      await o.goto(`${BASE}/dashboard`, { waitUntil: "load", timeout: 60_000 });
      const cleared = /\/login/.test(o.url());
      run.check("admin", "sign out clears the session", cleared, o.url().replace(BASE, ""));
      if (!cleared) await run.capture(o, "sign-out");
    } else {
      run.fail("admin", "sign out clears the session", "account menu never exposed the Sign out item");
      await run.capture(o, "sign-out");
    }
    await o.close();
    });
  }
  await c.close();
}

// ---- Org B (export enabled) ----------------------------------------------------
{
  const c = await newCtx();
  const ok = await login(c, ACCT.orgb);
  run.check("orgB", "login", ok);
  if (ok) {
    const p = await c.newPage();
    await p.goto(`${BASE}/dashboard/export`, { waitUntil: "load", timeout: 60_000 });
    run.check("orgB", "export ENABLED page reachable", await visible(p.getByRole("heading", { name: "Export organization data" })));
    const res = await p.request.get(`${BASE}/dashboard/export/download?type=assets`);
    const csv = res.status() === 200 ? await res.text() : "";
    run.check(
      "orgB",
      "export CSV contains own org only",
      res.status() === 200 && csv.includes("STG-QB-PUB") && !csv.includes("STG-QA-PUB"),
      `http ${res.status()}`
    );
    await p.close();
  }
  await c.close();
}

// ---- Customer staff ------------------------------------------------------------
{
  const c = await newCtx();
  const ok = await login(c, ACCT.staff);
  run.check("staff", "login", ok);
  if (ok) {
    let p = await c.newPage();
    await p.goto(`${BASE}/staff/t/stg-qa-rented`, { waitUntil: "load", timeout: 60_000 });
    run.check("staff", "scan recognition", await visible(p.getByText("Staff workflow", { exact: false })));
    await p.close();

    // READ-ONLY on purpose — completing these would close the rental session the acknowledgement
    // check depends on. See the module header.
    p = await c.newPage();
    await p.goto(`${BASE}/staff/t/stg-qa-rented/return`, { waitUntil: "load", timeout: 60_000 });
    run.check("staff", "staff return checklist reachable (not submitted)", await visible(p.getByRole("heading", { name: "Staff return checklist" })));
    await p.close();

    p = await c.newPage();
    await p.goto(`${BASE}/staff/t/stg-qa-public/outbound`, { waitUntil: "load", timeout: 60_000 });
    run.check("staff", "outbound inspection reachable (not submitted)", await visible(p.getByRole("heading", { name: "Outbound inspection" })));
    await p.close();

    p = await c.newPage();
    await p.goto(`${BASE}/dashboard/settings`, { waitUntil: "load", timeout: 60_000 });
    await p.waitForURL(/\/dashboard$/, { timeout: 15_000 }).catch(() => {});
    run.check("staff", "admin-only settings route denied", /\/dashboard$/.test(p.url()), p.url().replace(BASE, ""));
    await p.close();

    p = await c.newPage();
    const r = await p.goto(`${BASE}/staff/t/stg-qa-orgb`, { waitUntil: "load", timeout: 60_000 });
    run.check("cross-tenant", "org-A staff denied an org-B short code", r?.status() === 404, `http ${r?.status()}`);
    await p.close();
  }
  await c.close();
}

// ---- Notifications --------------------------------------------------------------
// Staging must never send live mail. Two independent facts back this: Preview holds no Resend
// credentials, AND lib/notifications/send.ts returns dry_run for VERCEL_ENV=preview before reading any
// credential. Neither is observable from the browser, so this records the expectation and points at the
// log line rather than pretending to have verified it here.
run.skip(
  "notifications",
  "submission logs dry_run / preview_environment",
  "not browser-observable — confirm in the Vercel runtime log for this deployment (see EMAIL_DELIVERABILITY_RUNBOOK)"
);

await browser.close();
process.exit(run.report() ? 0 : 1);
