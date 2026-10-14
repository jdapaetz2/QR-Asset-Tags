#!/usr/bin/env node
/**
 * Engineering Phase E0 — read-only inventory of one fixture organization (decisions, field allowlist and redaction in
 * scripts/lib/showcase-inventory.mjs).
 *
 *   npm.cmd run phase-e:audit:production -- --org=<fixture organization id>
 *   npm.cmd run phase-e:audit:staging -- --org=<fixture organization id>
 *
 * SAFE BY CONSTRUCTION
 *   - SELECTs, exact head counts and Storage listings only. scripts/lib/showcase-inventory.test.mjs scans this file
 *     and the library for write, RPC, signed-URL, download and auth-admin calls.
 *   - The target is stated (--target, fixed by the npm script) and must match the Supabase URL
 *     (scripts/lib/env-target.mjs: the known staging ref is refused as production and vice versa; anything
 *     unrecognised is treated as production).
 *   - --org is required and must be a fixture organization allowlisted for that target. Other organizations appear
 *     only as an id prefix, status and asset count.
 *   - Storage is listed only under org/<organization id>/ in each bucket, with paging and depth caps.
 *   - The report is assembled from allowlisted fields, re-checked for addresses, paths, signed URLs and key-shaped
 *     strings, then written to the gitignored qa-artifacts/phase-e/. The console shows counts and codes only.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (never printed).
 */
import { hash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";
import {
  COLUMNS,
  FIXTURE_ORGS,
  STORAGE_BUCKETS,
  auditRefusal,
  buildReport,
  parseAuditArgs,
  redactionProblems,
} from "../lib/showcase-inventory.mjs";

const TAG = "[showcase-audit]";
const OUT_DIR = "qa-artifacts/phase-e";
/** Public, not a secret (scripts/production/lib/qa-forms.mjs). */
const KNOWN_STAGING_REF = "kwserenxwjxozztyigmw";
const PAGE = 1000;
const MAX_ROWS = 50_000;
const MAX_SCAN_ROWS = 200_000;
const MAX_STORAGE_OBJECTS = 20_000;
const MAX_DEPTH = 8;
const ID_CHUNK = 100;

function refuse(message) {
  console.error(`\n${TAG} REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(1);
}

const parsed = parseAuditArgs(process.argv.slice(2));
if (parsed.error) refuse(parsed.error);
const { target: mode, org: orgId } = parsed.args;
const refusal = auditRefusal({ target: mode, org: orgId });
if (refusal) refuse(refusal);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl) refuse("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!serviceRoleKey) refuse("SUPABASE_SERVICE_ROLE_KEY is not set (never printed).");
const declaredStagingRef = (process.env.STAGING_SUPABASE_REF ?? "").trim();
if (declaredStagingRef && declaredStagingRef !== KNOWN_STAGING_REF) {
  refuse("STAGING_SUPABASE_REF is set to a ref other than the known staging project.");
}
let target;
try {
  target = assertTarget(mode, { supabaseUrl, expectedStagingRef: KNOWN_STAGING_REF });
} catch (err) {
  refuse(err.message);
}

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const fixture = FIXTURE_ORGS[mode][orgId];

/** Every row the scope selects, paged by id. Refuses to truncate unless told the caller can say so. */
async function readAll(table, columns, scope, { cap = MAX_ROWS, allowTruncate = false } = {}) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await scope(db.from(table).select(columns))
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`could not read ${table} (${error.message})`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return { rows, truncated: false };
    if (rows.length >= cap) {
      if (allowTruncate) return { rows, truncated: true };
      throw new Error(`${table} holds more than ${cap} rows in scope; this audit does not truncate it`);
    }
  }
}

async function countRows(table, scope) {
  const { count, error } = await scope(db.from(table).select("id", { count: "exact", head: true }));
  if (error) throw new Error(`could not count ${table} (${error.message})`);
  return count;
}

/** Every object under org/<id>/ in one bucket. Errors name the bucket only. */
async function listOrgObjects(bucket) {
  const objects = [];
  const pending = [{ prefix: `org/${orgId}`, depth: 0 }];
  while (pending.length > 0) {
    const { prefix, depth } = pending.pop();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db.storage
        .from(bucket)
        .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`could not list the ${bucket} bucket`);
      const rows = data ?? [];
      for (const entry of rows) {
        const objectPath = `${prefix}/${entry.name}`;
        // Folder entries have no id; file entries carry an id and metadata.
        if (entry.id === null || entry.id === undefined) {
          if (depth + 1 > MAX_DEPTH) throw new Error(`the ${bucket} bucket is nested deeper than expected`);
          pending.push({ prefix: objectPath, depth: depth + 1 });
        } else {
          objects.push({ bucket, path: objectPath, size: entry.metadata?.size ?? null, createdAt: entry.created_at ?? null });
          if (objects.length > MAX_STORAGE_OBJECTS) throw new Error(`the ${bucket} bucket holds more objects than this audit lists`);
        }
      }
      if (rows.length < PAGE) break;
    }
  }
  return objects;
}

const byOrg = (q) => q.eq("organization_id", orgId);

async function main() {
  console.log(`\n${TAG} ${mode.toUpperCase()} (host: ${target.host}) — read-only — organization ${orgId.slice(0, 8)} (${fixture})\n`);

  const { data: org, error: orgError } = await db.from("organizations").select(COLUMNS.organization).eq("id", orgId).maybeSingle();
  if (orgError) throw new Error(`could not read organizations (${orgError.message})`);
  if (!org) {
    console.log(`Organization ${orgId} does not exist on this project; nothing to inventory.`);
    return;
  }

  const assets = (await readAll("assets", COLUMNS.assets, byOrg)).rows;
  const qrLinks = (await readAll("qr_links", COLUMNS.qrLinks, byOrg)).rows;
  const pages = (await readAll("equipment_pages", COLUMNS.pages, byOrg)).rows;
  const documents = (await readAll("documents", COLUMNS.documents, byOrg)).rows;
  const sessions = (await readAll("asset_rental_sessions", COLUMNS.sessions, byOrg)).rows;
  const submissions = (await readAll("form_submissions", COLUMNS.submissions, byOrg)).rows;
  const acknowledgements = (await readAll("asset_acknowledgements", COLUMNS.acknowledgements, byOrg)).rows;
  const profiles = (await readAll("profiles", COLUMNS.profiles, byOrg)).rows;
  const tagRequests = (await readAll("tag_requests", COLUMNS.tagRequests, byOrg)).rows;
  const tagRequestAssets = [];
  for (let i = 0; i < tagRequests.length; i += ID_CHUNK) {
    const ids = tagRequests.slice(i, i + ID_CHUNK).map((r) => r.id);
    tagRequestAssets.push(...(await readAll("tag_request_assets", COLUMNS.tagRequestAssets, (q) => q.in("tag_request_id", ids))).rows);
  }
  const digestRuns = (await readAll("notification_digest_runs", COLUMNS.digestRuns, byOrg)).rows;
  const pageTemplates = (
    await readAll("equipment_page_templates", COLUMNS.pageTemplates, (q) => q.or(`organization_id.eq.${orgId},is_system.eq.true`))
  ).rows;
  const inspectionTemplates = (await readAll("inspection_templates", COLUMNS.inspectionTemplates, byOrg)).rows;
  const categoryDefaults = (await readAll("inspection_category_defaults", COLUMNS.categoryDefaults, byOrg)).rows;
  const activityCount = await countRows("activity_log", byOrg);

  const orgScanCount = await countRows("scan_events", byOrg);
  const scanCounts = {};
  for (const link of qrLinks) scanCounts[link.id] = await countRows("scan_events", (q) => q.eq("qr_link_id", link.id));
  const scanWalk = await readAll("scan_events", COLUMNS.scans, byOrg, { cap: MAX_SCAN_ROWS, allowTruncate: true });

  const storageObjects = [];
  for (const bucket of STORAGE_BUCKETS) storageObjects.push(...(await listOrgObjects(bucket)));

  const orgRows = (await readAll("organizations", "id, status", (q) => q)).rows;
  const assetOrgRows = (await readAll("assets", "id, organization_id", (q) => q, { cap: 500_000 })).rows;
  const assetCounts = {};
  for (const row of assetOrgRows) assetCounts[row.organization_id] = (assetCounts[row.organization_id] ?? 0) + 1;
  const otherOrgs = orgRows
    .filter((o) => o.id !== orgId)
    .map((o) => ({ id: o.id, status: o.status, assetCount: assetCounts[o.id] ?? 0 }));

  const report = buildReport({
    target: { mode, host: target.host, ref: target.ref },
    orgId,
    supabaseHost: target.host,
    now: new Date(),
    org,
    assets,
    qrLinks,
    pages,
    documents,
    sessions,
    submissions,
    acknowledgements,
    profiles,
    tagRequests,
    tagRequestAssets,
    digestRuns,
    pageTemplates,
    inspectionTemplates,
    categoryDefaults,
    activityCount,
    orgScanCount,
    scanCounts,
    scanRows: scanWalk.rows,
    scanWalkTruncated: scanWalk.truncated,
    storageObjects,
    otherOrgs,
  });

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const problems = redactionProblems(serialized);
  if (problems.length > 0) {
    console.error(`${TAG} the report failed its redaction check (${problems.join(", ")}); nothing was written.`);
    process.exitCode = 1;
    return;
  }

  printSummary(report);

  await mkdir(OUT_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const fileName = `showcase-audit-${mode}-${fixture}-${stamp}.json`;
  await writeFile(path.join(OUT_DIR, fileName), serialized);
  console.log(`\nArtifact: ${OUT_DIR}/${fileName} (${Buffer.byteLength(serialized)} bytes, sha256 ${hash("sha256", serialized)})\n`);
}

function printSummary(report) {
  const o = report.organization;
  const c = report.counts;
  console.log(
    `Organization: ${o.status}; return mode ${o.returnNotificationMode}; notification address ${o.notificationEmail}; ` +
      `support phone ${o.supportPhone}; support email ${o.supportEmail}; logo ${o.logo.kind}${o.logo.host ? ` (${o.logo.host})` : ""}.`
  );
  console.log(
    `Counts: assets ${c.assets} · QR rows ${c.qrLinks} · scans ${c.scansExact} (walked ${c.scansWalked}${c.scanWalkTruncated ? ", TRUNCATED" : ""}) · ` +
      `pages ${c.pages} · documents ${c.documents} · rental sessions ${c.rentalSessions} · submissions ${c.submissions} · ` +
      `acknowledgements ${c.acknowledgements} · profiles ${c.profiles} · tag requests ${c.tagRequests} · ` +
      `summary runs ${c.digestRuns} · activity_log ${c.activityLog}`
  );
  console.log("\n| Asset | Public | Archived | QR rows (code status primary · exact scans) | Rentals | Submissions | Docs |");
  console.log("|---|---|---|---|---|---|---|");
  for (const a of report.assets) {
    const links = a.qrLinks
      .map((l) => `${l.shortCode} ${l.status}${l.isProductionPrimary ? " primary" : ""} · ${l.scans.exactCount}`)
      .join("; ");
    console.log(
      `| ${a.assetCode} | ${a.publicStatus} | ${a.archivedAt ? "yes" : "no"} | ${links || "—"} | ${a.rentals.total} | ` +
        `${a.submissions.total} | ${a.documents.length} |`
    );
  }
  const storage = Object.entries(report.storage.buckets)
    .map(([bucket, s]) => `${bucket} ${s.objects} objects / ${s.bytes} bytes`)
    .join(" · ");
  console.log(`\nStorage under the organization prefix: ${storage}`);
  console.log(`Other organizations on this project: ${report.otherOrganizations.length}`);
}

try {
  await main();
} catch (err) {
  console.error(`\n${TAG} stopped: ${String(err?.message ?? err).split("\n")[0].slice(0, 200)}\n`);
  process.exitCode = 1;
}
