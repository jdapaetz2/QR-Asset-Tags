#!/usr/bin/env node
/**
 * Responsive overflow measurement (Phase B2) — one fixed, reusable command.
 *
 * WHAT IT MEASURES
 * Loads every admin + owner list route at six viewports and reports
 * `documentElement.scrollWidth - clientWidth`. This is the metric that surfaced D-1.
 *
 * HOW TO READ IT
 * A non-zero value does NOT necessarily mean the page can be dragged sideways. A wide `<table>` pushes
 * its min-content width into the *document's* intrinsic width even when an ancestor `overflow-x-auto`
 * clips it; mobile Chromium then shrink-to-fits — expanding `innerWidth` and rendering the page zoomed
 * out — instead of scrolling. Still a defect, just not the one the original D-1 note described.
 *
 * SECRETS
 * Everything sensitive is read from the environment, never from argv. Nothing secret is printed: the
 * report shows the base URL host only, and the bypass token is reported as present/absent. Populate
 * the untracked `.env.staging.local` (already gitignored) so the command line itself stays clean:
 *
 *   QA_BASE_URL=https://<preview-host>
 *   VERCEL_AUTOMATION_BYPASS_SECRET=<token>
 *   STAGING_QA_PASSWORD=<qa password>
 *   NEXT_PUBLIC_SUPABASE_URL / STAGING_SUPABASE_REF   (for the staging guard)
 *
 * SAFEGUARDS (fail-closed, unchanged from B1A)
 *  - Refuses unless the resolved Supabase target is STAGING, via the shared `assertTarget`.
 *  - Refuses a production-looking base URL.
 *  - Read-only: navigates and measures. It never writes application data.
 *
 * Usage:  npm run qa:overflow
 *         npm run qa:overflow -- --diagnose /owner/tag-requests --width 768
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { chromium } from "playwright";

import { assertTarget } from "../lib/env-target.mjs";

// ---- Inputs: environment only ------------------------------------------------
const BASE = (process.env.QA_BASE_URL || "").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const QA_PASSWORD = process.env.STAGING_QA_PASSWORD || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const STAGING_REF = process.env.STAGING_SUPABASE_REF || "";
const REPORT_PATH = process.env.QA_REPORT_PATH || join("qa-artifacts", "responsive-overflow.md");

// argv carries only non-secret switches.
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const diagnosePath = flag("diagnose");
const diagnoseWidth = Number(flag("width") || 768);

function fail(message, extra = []) {
  console.error(`\n[qa:overflow] REFUSING TO RUN\n\n  ${message}\n`);
  for (const line of extra) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

if (!BASE) fail("QA_BASE_URL is not set.", ["Add it to .env.staging.local — never pass it on the command line."]);
if (!QA_PASSWORD) fail("STAGING_QA_PASSWORD is not set.");
if (!SUPABASE_URL) fail("NEXT_PUBLIC_SUPABASE_URL is not set (needed for the staging guard).");

// ---- Fail-closed staging guard ----------------------------------------------
let target;
try {
  target = assertTarget("staging", {
    supabaseUrl: SUPABASE_URL,
    expectedStagingRef: STAGING_REF || null,
  });
} catch (err) {
  fail(err.message, ["This measurement only ever runs against staging. See docs/STAGING_ENVIRONMENT_SETUP.md."]);
}

let baseHost;
try {
  baseHost = new URL(BASE).hostname;
} catch {
  fail("QA_BASE_URL is not a valid URL.");
}
// A permanent-looking origin is not a QA target — refuse rather than measure production.
if (!/\.vercel\.app$/i.test(baseHost) && !/^(localhost|127\.0\.0\.1)$/i.test(baseHost)) {
  fail(`QA_BASE_URL host (${baseHost}) is not a preview/localhost host.`, [
    "This script measures staging deployments only.",
  ]);
}

const HEADERS = BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {};

// ---- Routes + viewports ------------------------------------------------------
const GROUPS = [
  {
    label: "ADMIN",
    email: "qa.admin@mulemark-staging.invalid",
    paths: [
      "/dashboard",
      "/dashboard/assets",
      "/dashboard/submissions",
      "/dashboard/rentals",
      "/dashboard/analytics",
      "/dashboard/settings/users",
      "/dashboard/templates",
      "/dashboard/templates/return-inspections",
      "/dashboard/tag-requests",
    ],
  },
  {
    label: "OWNER",
    email: "qa.owner@mulemark-staging.invalid",
    paths: ["/owner", "/owner/users", "/owner/tag-requests", "/owner/analytics", "/owner/production"],
  },
];

/** Phone sizes plus the exact `md` (768) and `lg` (1024) switch points, where regressions hide. */
const SIZES = [
  [360, "360"],
  [390, "390"],
  [430, "430"],
  [768, "tablet"],
  [1024, "lg"],
  [1280, "desktop"],
];

async function newContext(browser, width) {
  const mobile = width < 768;
  return browser.newContext({
    viewport: { width, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2.6 : 1,
    extraHTTPHeaders: HEADERS,
  });
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard|\/owner/, { timeout: 45_000 });
}

const overflowOf = (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });

const browser = await chromium.launch();

// ---- Diagnose mode: name the unclipped offenders on one route ----------------
if (diagnosePath) {
  const group = GROUPS.find((g) => g.paths.includes(diagnosePath)) || GROUPS[0];
  const context = await newContext(browser, diagnoseWidth);
  const page = await context.newPage();
  await signIn(page, group.email);
  await page.goto(`${BASE}${diagnosePath}`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(600);
  const found = await page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const clipped = (el) => {
      let a = el.parentElement;
      while (a && a !== de) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
        a = a.parentElement;
      }
      return false;
    };
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const rc = el.getBoundingClientRect();
      if (rc.right > vw + 1 && rc.width > 4 && !clipped(el)) {
        out.push({
          tag: el.tagName,
          cls: (el.className || "").toString().slice(0, 58),
          right: Math.round(rc.right),
          width: Math.round(rc.width),
          text: (el.textContent || "").trim().slice(0, 30),
        });
      }
    }
    return { vw, over: de.scrollWidth - vw, out: out.slice(0, 10), total: out.length };
  });
  console.log(`\n${diagnosePath} @ ${found.vw}px — overflow ${found.over}px, ${found.total} unclipped offender(s)`);
  if (found.total === 0 && found.over > 0) {
    console.log("  (no unclipped element: a clipped table's min-content is leaking into the document width)");
  }
  for (const n of found.out) {
    console.log(`  ${n.tag.padEnd(7)} right=${String(n.right).padStart(5)} w=${String(n.width).padStart(5)} | ${n.cls} | ${JSON.stringify(n.text)}`);
  }
  await browser.close();
  process.exit(0);
}

// ---- Full sweep --------------------------------------------------------------
const report = {};
for (const group of GROUPS) {
  report[group.label] = {};
  for (const [width, name] of SIZES) {
    const context = await newContext(browser, width);
    const page = await context.newPage();
    await signIn(page, group.email);
    for (const path of group.paths) {
      await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 45_000 });
      await page.waitForTimeout(450);
      (report[group.label][path] ||= {})[name] = await overflowOf(page);
    }
    await context.close();
  }
}
await browser.close();

// ---- Redacted report ---------------------------------------------------------
let failures = 0;
const lines = [];
lines.push("# Responsive overflow report");
lines.push("");
lines.push(`- Target: **STAGING** (Supabase ref \`${target.ref}\`)`);
lines.push(`- Base host: \`${baseHost}\``);
lines.push(`- Protection bypass: ${BYPASS ? "supplied (value not shown)" : "not supplied"}`);
lines.push(`- Metric: \`documentElement.scrollWidth - clientWidth\`, in px. 0 = clean.`);
lines.push("");

for (const [label, routes] of Object.entries(report)) {
  lines.push(`## ${label}`);
  lines.push("");
  lines.push(`| Route | ${SIZES.map(([, n]) => n).join(" | ")} |`);
  lines.push(`|---|${SIZES.map(() => "---").join("|")}|`);
  for (const [path, by] of Object.entries(routes)) {
    const bad = SIZES.some(([, n]) => by[n] > 1);
    if (bad) failures++;
    lines.push(`| \`${path}\`${bad ? " **OVERFLOW**" : ""} | ${SIZES.map(([, n]) => by[n]).join(" | ")} |`);
  }
  lines.push("");
}
lines.push(failures === 0 ? "**ALL ROUTES CLEAN AT ALL VIEWPORTS.**" : `**${failures} route(s) overflowing.**`);
lines.push("");

const body = lines.join("\n");
console.log(body);

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, body, "utf8");
console.log(`report written to ${REPORT_PATH}`);

process.exit(failures ? 1 : 0);
