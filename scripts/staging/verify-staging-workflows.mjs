#!/usr/bin/env node
/**
 * Staging workflow verification (Phase B1B).
 *
 * Exercises the golden paths against a deployed STAGING/Preview deployment, using the deterministic
 * fixtures created by seed-staging-qa.mjs. Read-mostly: it submits public forms (which staging exists
 * to receive) but never mutates another tenant and never touches production.
 *
 * This deliberately does NOT reuse the Playwright E2E suite. That suite is loopback-guarded
 * (tests/security/setup/stack.ts#assertLocal) and its fixture seeder tears down and recreates
 * organizations — pointing it at a hosted project would reintroduce exactly the hazard Phase B1 removed.
 *
 * Env: STAGING_BASE_URL, VERCEL_AUTOMATION_BYPASS_SECRET (optional), QA_PASSWORD.
 * No secret is printed.
 *
 * Usage: node scripts/staging/verify-staging-workflows.mjs
 */
import { chromium } from "playwright";

const BASE = (process.env.STAGING_BASE_URL || "").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const PW = process.env.QA_PASSWORD || "";
if (!BASE || !PW) {
  console.error("need STAGING_BASE_URL and QA_PASSWORD");
  process.exit(1);
}
const H = BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {};
const ACCT = {
  owner: "qa.owner@mulemark-staging.invalid",
  admin: "qa.admin@mulemark-staging.invalid",
  staff: "qa.staff@mulemark-staging.invalid",
  orgb: "qa.admin.orgb@mulemark-staging.invalid",
};

const rows = [];
const rec = (area, check, ok, note = "") => {
  rows.push({ area, check, ok, note });
  process.stderr.write(`  [${ok ? "PASS" : "FAIL"}] ${area} - ${check}${note ? " - " + note : ""}\n`);
};
const visible = async (loc, ms = 10000) => {
  try {
    await loc.first().waitFor({ state: "visible", timeout: ms });
    return true;
  } catch {
    return false;
  }
};

const browser = await chromium.launch();
const ctx = async () => browser.newContext({ extraHTTPHeaders: H });

async function login(context, email) {
  const p = await context.newPage();
  try {
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByLabel("Email").fill(email);
    await p.getByLabel("Password").fill(PW);
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL(/\/dashboard|\/owner/, { timeout: 45000 });
    return true;
  } catch {
    return false;
  } finally {
    await p.close();
  }
}

// ---- Public ------------------------------------------------------------------
{
  const c = await ctx();
  let p = await c.newPage();
  const r = await p.goto(`${BASE}/t/stg-qa-public`, { waitUntil: "load", timeout: 60000 });
  const named = await visible(p.getByText("Staging QA Trailer", { exact: false }));
  rec("public", "scan page renders", r?.status() === 200 && named);
  rec(
    "public",
    "no horizontal overflow",
    await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1)
  );
  await p.close();

  p = await c.newPage();
  await p.goto(`${BASE}/t/stg-qa-disabled`, { waitUntil: "load", timeout: 60000 });
  rec("public", "disabled QR shows unavailable", await visible(p.getByRole("heading", { name: /available/i })));
  await p.close();

  p = await c.newPage();
  await p.goto(`${BASE}/forms/stg-qa-public/support`, { waitUntil: "load", timeout: 60000 });
  await p.getByLabel("Your name").fill("B1B Workflow");
  await p.getByRole("textbox", { name: "Email" }).fill("b1b@mulemark-staging.invalid");
  await p.getByLabel("What do you need help with?").fill("B1B staging workflow probe.");
  await p.getByRole("button", { name: "Send support request" }).click();
  await p.waitForURL(/thanks/, { timeout: 60000 }).catch(() => {});
  rec("public", "support form submits + reference", await visible(p.getByText(/^SUB-\d{4}-[0-9A-F]{6}$/)));
  await p.close();

  p = await c.newPage();
  await p.goto(`${BASE}/forms/stg-qa-public/return`, { waitUntil: "load", timeout: 60000 });
  rec("public", "renter return checklist stage 1", await visible(p.getByText("Step 1 of 3")));
  await p.close();

  p = await c.newPage();
  await p.goto(`${BASE}/t/stg-qa-rented`, { waitUntil: "load", timeout: 60000 });
  rec(
    "public",
    "acknowledgement prompt (active session)",
    await visible(p.getByRole("dialog", { name: "Before you use this equipment" }), 15000)
  );
  await p.close();
  await c.close();
}

// ---- Owner -------------------------------------------------------------------
{
  const c = await ctx();
  const ok = await login(c, ACCT.owner);
  rec("owner", "login", ok);
  if (ok) {
    const p = await c.newPage();
    await p.goto(`${BASE}/owner`, { waitUntil: "load", timeout: 60000 });
    rec("owner", "organizations list", await visible(p.getByRole("heading", { name: "Organizations" })));
    await p.close();
  }
  await c.close();
}

// ---- Customer admin ----------------------------------------------------------
{
  const c = await ctx();
  const ok = await login(c, ACCT.admin);
  rec("admin", "login", ok);
  if (ok) {
    for (const [label, path, heading] of [
      ["assets", "/dashboard/assets", "Assets"],
      ["submissions", "/dashboard/submissions", "Submissions"],
      ["rentals", "/dashboard/rentals", "Rental sessions"],
    ]) {
      const p = await c.newPage();
      await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60000 });
      rec("admin", label, await visible(p.getByRole("heading", { name: heading })));
      await p.close();
    }
    const p = await c.newPage();
    await p.goto(`${BASE}/dashboard/export`, { waitUntil: "load", timeout: 60000 });
    await p.waitForURL(/\/dashboard\/settings/, { timeout: 15000 }).catch(() => {});
    rec("admin", "export DISABLED redirects to settings", /\/dashboard\/settings/.test(p.url()), p.url().replace(BASE, ""));
    await p.close();

    const q = await c.newPage();
    await q.goto(`${BASE}/dashboard/assets`, { waitUntil: "load", timeout: 60000 });
    const leak = await q.getByText("STG-QB-PUB").count();
    rec("cross-tenant", "org-A admin cannot see org-B asset", leak === 0);
    await q.close();
  }
  await c.close();
}

// ---- Org B (export enabled) --------------------------------------------------
{
  const c = await ctx();
  const ok = await login(c, ACCT.orgb);
  rec("orgB", "login", ok);
  if (ok) {
    const p = await c.newPage();
    await p.goto(`${BASE}/dashboard/export`, { waitUntil: "load", timeout: 60000 });
    rec("orgB", "export ENABLED page reachable", await visible(p.getByRole("heading", { name: "Export organization data" })));
    const res = await p.request.get(`${BASE}/dashboard/export/download?type=assets`);
    const csv = res.status() === 200 ? await res.text() : "";
    rec(
      "orgB",
      "export CSV contains own org only",
      res.status() === 200 && csv.includes("STG-QB-PUB") && !csv.includes("STG-QA-PUB")
    );
    await p.close();
  }
  await c.close();
}

// ---- Customer staff ----------------------------------------------------------
{
  const c = await ctx();
  const ok = await login(c, ACCT.staff);
  rec("staff", "login", ok);
  if (ok) {
    let p = await c.newPage();
    await p.goto(`${BASE}/staff/t/stg-qa-rented`, { waitUntil: "load", timeout: 60000 });
    rec("staff", "scan recognition", await visible(p.getByText("Staff workflow", { exact: false })));
    await p.close();

    p = await c.newPage();
    await p.goto(`${BASE}/staff/t/stg-qa-rented/return`, { waitUntil: "load", timeout: 60000 });
    rec("staff", "staff return checklist reachable", await visible(p.getByRole("heading", { name: "Staff return checklist" })));
    await p.close();

    p = await c.newPage();
    await p.goto(`${BASE}/staff/t/stg-qa-public/outbound`, { waitUntil: "load", timeout: 60000 });
    rec("staff", "outbound inspection reachable", await visible(p.getByRole("heading", { name: "Outbound inspection" })));
    await p.close();

    p = await c.newPage();
    await p.goto(`${BASE}/dashboard/settings`, { waitUntil: "load", timeout: 60000 });
    await p.waitForURL(/\/dashboard$/, { timeout: 15000 }).catch(() => {});
    rec("staff", "admin route denied (settings redirects)", /\/dashboard$/.test(p.url()), p.url().replace(BASE, ""));
    await p.close();

    p = await c.newPage();
    const r = await p.goto(`${BASE}/staff/t/stg-qa-orgb`, { waitUntil: "load", timeout: 60000 });
    rec("cross-tenant", "org-A staff denied org-B short code", r?.status() === 404, `http ${r?.status()}`);
    await p.close();
  }
  await c.close();
}

await browser.close();

console.log("\n| Area | Check | Result | Note |");
console.log("|---|---|---|---|");
for (const r of rows) console.log(`| ${r.area} | ${r.check} | ${r.ok ? "PASS" : "FAIL"} | ${r.note} |`);
const fails = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length} checks - ${rows.length - fails} pass, ${fails} fail.`);
process.exit(fails ? 1 : 0);
