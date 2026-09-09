#!/usr/bin/env node
/**
 * Phase C7 — what the submissions inbox costs while an admin simply leaves it open.
 *
 * C0 §11 recorded the behaviour ("polls a full-page router.refresh() every 30 s while visible whether or
 * not anything changed") but never counted it. This does, so the before/after is a measurement rather
 * than an argument.
 *
 * BOTH HALVES RUN IN ONE SESSION — 90 s visible, then 90 s hidden — so the hidden number is a genuine
 * control taken against the same page, the same auth and the same network, not a separate run that
 * happened to be quieter.
 *
 * Every request is CLASSIFIED and the classification is printed, because a bare total invites the reader
 * to assume a breakdown that was never measured:
 *   - rsc       — React Server Component payloads (`?_rsc=`), i.e. what a refresh or navigation costs
 *   - prefetch  — link prefetches (Next sends `next-router-prefetch`), traffic nobody asked for
 *   - freshness — the C7 token endpoint, once it exists
 *   - document  — top-level HTML
 *   - other     — anything left, listed by host so it can never be quietly ignored
 *
 * The tab is hidden by emulating `visibilitychange` + `document.hidden` via CDP, which is what the
 * component actually listens to. Backgrounding a real window is not reproducible in CI.
 *
 * READ-ONLY: it signs in, opens one page and waits. It submits nothing and mutates nothing.
 *
 * Usage: npm run perf:inbox:staging -- --seconds=90
 */
import { chromium } from "playwright";

import { assertSmokeTarget } from "../lib/smoke-target.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback = "") =>
  (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=").slice(1).join("=");

const SECONDS = Math.max(10, Math.min(600, Number(flag("seconds", "90")) || 90));
const LABEL = flag("label", "baseline");
const BASE = (process.env.QA_BASE_URL || process.env.STAGING_BASE_URL || "").replace(/\/$/, "");
const PASSWORD = process.env.STAGING_QA_PASSWORD || "";
const ADMIN = "qa.admin@mulemark-staging.invalid";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

function refuse(message) {
  console.error(`\n[inbox-freshness] REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(1);
}

if (!BASE) refuse("QA_BASE_URL (or STAGING_BASE_URL) is not set.");
if (!PASSWORD) refuse("STAGING_QA_PASSWORD is not set (never printed).");

let site;
try {
  site = assertSmokeTarget("staging", BASE);
} catch (err) {
  refuse(err.message);
}

console.log(`\n[inbox-freshness] STAGING (${site.host}) — label "${LABEL}", ${SECONDS}s visible then ${SECONDS}s hidden\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Classify one request. Order matters: a prefetch is also RSC, and prefetch is the more specific fact. */
function classify(request) {
  const url = request.url();
  const headers = request.headers();
  if (url.includes("/api/submissions/freshness")) return "freshness";
  if (headers["next-router-prefetch"] === "1") return "prefetch";
  if (url.includes("_rsc=") || headers["rsc"] === "1") return "rsc";
  if (request.resourceType() === "document") return "document";
  return "other";
}

function newBucket() {
  return { total: 0, rsc: 0, prefetch: 0, freshness: 0, document: 0, other: 0, bytes: 0, otherHosts: new Map() };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {},
});
const page = await context.newPage();

let bucket = null; // null = not recording (setup traffic is never counted)

page.on("request", (req) => {
  if (!bucket) return;
  const kind = classify(req);
  bucket.total++;
  bucket[kind]++;
  if (kind === "other") {
    const host = (() => {
      try {
        return new URL(req.url()).host;
      } catch {
        return "unparseable";
      }
    })();
    bucket.otherHosts.set(host, (bucket.otherHosts.get(host) ?? 0) + 1);
  }
});
page.on("response", async (res) => {
  if (!bucket) return;
  try {
    const len = Number(res.headers()["content-length"] ?? 0);
    if (Number.isFinite(len)) bucket.bytes += len;
  } catch {
    // A body we cannot size is not a reason to abandon the whole measurement.
  }
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill(ADMIN);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });

  await page.goto(`${BASE}/dashboard/submissions`, { waitUntil: "networkidle" });
  // Settle: the initial render's own prefetches belong to page load, not to idle cost.
  await sleep(3_000);

  // ---- VISIBLE ------------------------------------------------------------
  bucket = newBucket();
  const visibleStart = Date.now();
  await sleep(SECONDS * 1000);
  const visible = bucket;
  const visibleMs = Date.now() - visibleStart;
  bucket = null;

  // ---- HIDDEN -------------------------------------------------------------
  // Emulate exactly what the component listens for. Overriding document.hidden alone would not fire
  // the event; dispatching the event alone would leave document.hidden false. Both are needed.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }).catch(() => {});
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  bucket = newBucket();
  const hiddenStart = Date.now();
  await sleep(SECONDS * 1000);
  const hidden = bucket;
  const hiddenMs = Date.now() - hiddenStart;
  bucket = null;

  const row = (name, b, ms) =>
    `| ${name} | ${Math.round(ms / 1000)}s | ${b.total} | ${b.rsc} | ${b.prefetch} | ${b.freshness} | ` +
    `${b.document} | ${b.other} | ${(b.bytes / 1024).toFixed(1)} KB |`;

  console.log("\n| Tab state | window | total | rsc | prefetch | freshness | document | other | bytes |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  console.log(row("visible", visible, visibleMs));
  console.log(row("hidden", hidden, hiddenMs));

  // The observed cadence, derived from what actually happened rather than from the configured value.
  const refreshes = visible.rsc + visible.freshness;
  console.log(
    `\n  visible: ${refreshes} refresh/freshness request(s) in ${Math.round(visibleMs / 1000)}s` +
      (refreshes > 0 ? ` → roughly one every ${Math.round(visibleMs / 1000 / refreshes)}s` : "")
  );
  console.log(`  hidden:  ${hidden.rsc + hidden.freshness} — ${hidden.rsc + hidden.freshness === 0 ? "ZERO, as required" : "NOT zero, investigate"}`);

  for (const [name, b] of [["visible", visible], ["hidden", hidden]]) {
    if (b.other > 0) {
      const hosts = [...b.otherHosts.entries()].map(([h, n]) => `${h}×${n}`).join(", ");
      console.log(`  ${name} "other" breakdown: ${hosts}`);
    }
  }
  console.log("");
} finally {
  await context.close();
  await browser.close();
}
