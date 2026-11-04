#!/usr/bin/env node
/**
 * Engineering Phase E2C — the presenter's pre-call check of the Northridge showcase. Read-only and scan-free.
 *
 *   npm.cmd run phase-e:precall:production
 *   npm.cmd run phase-e:precall:staging          (pages through QA_BASE_URL with the Preview bypass)
 *
 * 1. Data, through the service role's read-only PostgREST client (scripts/lib/tenant-snapshot.mjs: select, count and
 *    Storage reads only), after the target guard: the organization is active and on the Demo plan; each showcase asset
 *    is public and not archived, with a cover and a published page; the four protected QR rows are active
 *    production-primary rows; every row of the tracked dataset is present.
 * 2. Files and links: each cover's public object answers; each public manual link answers (HEAD; a publisher that
 *    refuses HEAD is a note, not a failure).
 * 3. The storyline now: the anchor and its age (the 7-day analytics go quiet about a week after it), the rentals on rent,
 *    the curated open items (3 new and 2 reviewed at the anchor) and the visitor rows since the anchor (reports,
 *    acknowledgements and scans that are not the dataset's), which a presenter reset keeps.
 * 4. Pages: each protected route's scan-free /nojs/t/ render resolves to its asset and shows the demo notice. `/t/` is
 *    never requested; bodies are inspected in memory only, never printed or saved.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";
import { DATASET_FILE } from "../lib/showcase-dataset.mjs";
import { STAGING_REF } from "../lib/showcase-target.mjs";
import { publicRouteVerdict } from "../lib/staging-probe.mjs";
import { readAll, readOnlyClient } from "../lib/tenant-snapshot.mjs";
import { bypassHeaders } from "../smoke/lib/runner.mjs";

const TAG = "[precall]";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";
const DAY_MS = 86_400_000;
const TIMEOUT_MS = 20_000;
const DEMO_NOTICE = /real equipment models and reference documents/;

function refuse(message) {
  console.error(`\n${TAG} REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(2);
}

const target = /^--target=(production|staging)$/.exec(process.argv[2] ?? "")?.[1];
if (!target || process.argv.length > 3) refuse("give exactly --target=production or --target=staging");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl || !serviceRoleKey) refuse("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (never printed)");
try {
  assertTarget(target, { supabaseUrl, expectedStagingRef: STAGING_REF });
} catch (err) {
  refuse(err.message);
}
const base = target === "production" ? "https://mulemark.io" : String(process.env.QA_BASE_URL ?? "").replace(/\/+$/, "");
if (!base) refuse("QA_BASE_URL (the staging Preview) is required for the staging page checks");
const pageHeaders = target === "production" ? {} : bypassHeaders();

const dataset = JSON.parse(readFileSync(path.join(REPO, DATASET_FILE), "utf8"));
const results = [];
const check = (name, ok, detail = "", level = ok ? "PASS" : "FAIL") => results.push({ name, level, detail });
const note = (name, detail = "") => results.push({ name, level: "NOTE", detail });

async function request(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const db = readOnlyClient(createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }));
  const byOrg = (x) => x.eq("organization_id", NORTHRIDGE);
  const showcaseIds = dataset.assets.map((a) => a.asset_id);

  // 1. Data.
  const [org] = await readAll(db, "organizations", (x) => x.eq("id", NORTHRIDGE), "id, status, plan_key, logo_url");
  check("Northridge is active", org?.status === "active", org?.status ?? "missing");
  check("Northridge is on the Demo plan (the public pages show the demo notice)", org?.plan_key === "demo", org?.plan_key ?? "none");
  const assets = await readAll(db, "assets", (x) => x.in("id", showcaseIds), "id, asset_code, public_status, archived_at, cover_image_url, active_rental_session_id");
  const pages = await readAll(db, "equipment_pages", (x) => x.in("asset_id", showcaseIds), "id, asset_id, is_published");
  const documents = await readAll(db, "documents", (x) => x.in("asset_id", showcaseIds).eq("visibility", "public"), "id, asset_id, title, document_type, url, storage_path");
  for (const a of dataset.assets) {
    const row = assets.find((r) => r.id === a.asset_id);
    check(`${a.asset_code}: public, not archived, with a cover`, Boolean(row && row.public_status === "public" && !row.archived_at && row.cover_image_url), row ? `${row.public_status}${row.archived_at ? ", archived" : ""}${row.cover_image_url ? "" : ", no cover"}` : "missing");
    check(`${a.asset_code}: page published`, pages.some((p) => p.asset_id === a.asset_id && p.is_published));
    const docs = documents.filter((d) => d.asset_id === a.asset_id);
    check(`${a.asset_code}: a public manual`, docs.some((d) => d.document_type === "manual"), docs.map((d) => d.title).join("; ") || "none");
    check(`${a.asset_code}: no Start-Up Guide published (parked)`, !docs.some((d) => d.document_type === "startup_guide"));
  }
  const qr = await readAll(db, "qr_links", (x) => x.in("id", dataset.assets.map((a) => a.qr_link_id)), "id, short_code, status, is_production_primary");
  check("the four protected QR rows are active production-primary rows", qr.length === 4 && qr.every((r) => r.status === "active" && r.is_production_primary), qr.map((r) => `${r.short_code}:${r.status}`).join(", "));
  const live = {};
  for (const table of Object.keys(dataset.rows)) {
    live[table] = await readAll(db, table, byOrg, table === "scan_events" ? "id, scanned_at" : table === "form_submissions" ? "id, status, created_at" : "id, created_at");
    const ids = new Set(live[table].map((r) => r.id));
    const present = dataset.rows[table].filter((r) => ids.has(r.id)).length;
    check(`${table}: every dataset row present`, present === dataset.rows[table].length, `${present} of ${dataset.rows[table].length}`);
  }

  // 2. Files and links.
  for (const row of assets) {
    if (!row.cover_image_url) continue;
    const res = await request(row.cover_image_url, { method: "HEAD" }).catch(() => null);
    check(`${row.asset_code}: the cover file answers`, res?.status === 200, res ? `HTTP ${res.status}` : "no response");
  }
  for (const doc of documents.filter((d) => d.url)) {
    const res = await request(doc.url, { method: "HEAD", redirect: "follow" }).catch(() => null);
    if (res && res.status < 400) check(`manual link answers: ${doc.title}`, true, `HTTP ${res.status}`);
    else note(`manual link did not answer a HEAD request: ${doc.title}`, res ? `HTTP ${res.status} (open it by hand once)` : "no response");
  }

  // 3. The storyline now.
  const anchor = Date.parse(dataset.anchor.utc);
  const ageDays = Math.floor((Date.now() - anchor) / DAY_MS);
  const ageNote = `${dataset.anchor.local} ${dataset.anchor.time_zone}, ${ageDays} day(s) ago`;
  if (ageDays <= 7) check("the history's anchor is recent enough for the 7-day analytics", true, ageNote);
  else note("the history's anchor is over a week old: the 7-day analytics are going quiet (DEMO_REFRESH_POLICY.md)", ageNote);
  const onRent = dataset.assets.filter((a) => a.active_rental_session_id).map((a) => {
    const row = assets.find((r) => r.id === a.asset_id);
    return `${a.asset_code} ${row?.active_rental_session_id === a.active_rental_session_id ? "on its curated rental" : "NOT on its curated rental"}`;
  });
  check("the curated rentals are on rent", onRent.every((s) => s.endsWith("on its curated rental")), onRent.join("; "));
  const curated = new Set(dataset.rows.form_submissions.map((r) => r.id));
  const open = { new: 0, reviewed: 0 };
  for (const r of live.form_submissions) if (curated.has(r.id) && r.status in open) open[r.status]++;
  if (open.new === 3 && open.reviewed === 2) check("curated open items: 3 new, 2 reviewed (as authored)", true);
  else note("curated open items differ from the authored 3 new, 2 reviewed (a presenter reset restores them)", JSON.stringify(open));
  const datasetIds = Object.fromEntries(Object.entries(dataset.rows).map(([table, rows]) => [table, new Set(rows.map((r) => r.id))]));
  const visitorsSince = (table, column) => live[table].filter((r) => !datasetIds[table].has(r.id) && Date.parse(r[column]) > anchor).length;
  note(
    "visitor rows since the anchor (kept by a presenter reset)",
    `${visitorsSince("form_submissions", "created_at")} report(s), ${visitorsSince("asset_acknowledgements", "created_at")} acknowledgement(s), ${visitorsSince("scan_events", "scanned_at")} scan(s)`
  );

  // 4. Pages (scan-free).
  for (const a of dataset.assets) {
    const res = await request(`${base}/nojs/t/${encodeURIComponent(a.short_code)}`, { headers: pageHeaders, redirect: "manual" }).catch(() => null);
    const body = res ? await res.text() : "";
    const verdict = res ? publicRouteVerdict({ status: res.status, body, assetCode: a.asset_code }) : { ok: false, reason: "no response" };
    check(`/nojs/t/${a.short_code} resolves to ${a.asset_code}`, verdict.ok, verdict.reason);
    check(`/nojs/t/${a.short_code} shows the demo notice`, DEMO_NOTICE.test(body));
  }

  console.log(`\n${TAG} ${target.toUpperCase()} — pre-call check of the Northridge showcase (read-only, scan-free)`);
  for (const r of results) console.log(`  ${r.level.padEnd(4)}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  const failed = results.filter((r) => r.level === "FAIL").length;
  const notes = results.filter((r) => r.level === "NOTE").length;
  console.log(`${TAG} ${failed === 0 ? "ready" : `${failed} check(s) failed`}${notes ? ` · ${notes} note(s)` : ""}\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`\n${TAG} FAILED: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}\n`);
  process.exitCode = 1;
});
