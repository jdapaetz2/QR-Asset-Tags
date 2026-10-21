#!/usr/bin/env node
/**
 * Engineering Phase E2B — prepare a REHEARSAL target so the showcase dataset can be applied to it.
 *
 *   npm.cmd run phase-e:showcase:bootstrap:local   [-- --apply]     the repo's local stack
 *   npm.cmd run phase-e:showcase:bootstrap:staging [-- --apply]     staging, through the guarded PHASE_E_STAGING_DB_URL
 *
 * Without --apply it only reports what it would change. Production is refused before anything is read.
 *
 * The local seed and staging hold EXCAVATOR-017 and TRAILER-014 but not EXCAVATOR-3015 and TRAILER-2041. This tool:
 *   - adds the missing showcase assets, their QR rows and a published page row, with the Production ids, short codes
 *     and creation times (read-only Production audit of 2026-10-20), and aligns the creation times of 017 and 014 and
 *     their QR rows, so no synthetic rental predates its asset;
 *   - deletes the seed and test scans of the four assets (never a scan the dataset owns);
 *   - LOCAL ONLY: creates a local Northridge admin login for the walkthrough and sets the local organization to
 *     Northridge's notification mode with an `.invalid` address. A hosted organization's settings are never changed and
 *     no account is created on a hosted target.
 * It is the only E2B tool that writes QR rows, and only these four, on rehearsal targets. Running it twice changes
 * nothing the second time.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { assertTarget } from "../lib/env-target.mjs";
import { assertLoopbackTargets, readLocalStackStatus } from "../lib/local-stack.mjs";
import { DATASET_FILE, ownedIds } from "../lib/showcase-dataset.mjs";
import { LOCAL_ADMIN, LOCAL_PASSWORD } from "../lib/showcase-local-login.mjs";
import { STAGING_REF, assertStagingDatabase, stagingDbConfig } from "../lib/showcase-target.mjs";

const TAG = "[showcase-bootstrap]";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";

/** The four showcase assets as Production holds them (ids, codes, creation times), from the read-only audit. */
export const PRODUCTION_ROWS = Object.freeze([
  { asset_code: "EXCAVATOR-017", asset_id: "21111111-1111-4111-8111-111111111101", asset_name: "Excavator 017", category: "Excavator", asset_created_at: "2026-06-15T23:56:43.962+00:00", qr_link_id: "41111111-1111-4111-8111-111111111101", short_code: "demo-ex017", qr_created_at: "2026-06-15T23:56:43.962+00:00" },
  { asset_code: "EXCAVATOR-3015", asset_id: "7f7753d2-37f9-4e74-bbb2-90f048523f21", asset_name: "Mini Excavator 301.5", category: "Mini Excavator", asset_created_at: "2026-06-23T18:46:31.019+00:00", qr_link_id: "07c8ca60-0102-48c6-ac96-a8cb4b27ca90", short_code: "ezzs9ueg", qr_created_at: "2026-06-27T18:09:09.114+00:00" },
  { asset_code: "TRAILER-014", asset_id: "21111111-1111-4111-8111-111111111102", asset_name: "Trailer 014", category: "Utility Trailer", asset_created_at: "2026-06-15T23:56:43.962+00:00", qr_link_id: "41111111-1111-4111-8111-111111111102", short_code: "demo-tr014", qr_created_at: "2026-06-15T23:56:43.962+00:00" },
  { asset_code: "TRAILER-2041", asset_id: "3313ed1c-f738-4817-b4fa-6f2163dc2e14", asset_name: "Utility Trailer 204", category: "Utility Trailer", asset_created_at: "2026-06-23T18:46:31.314+00:00", qr_link_id: "97c20650-4c09-4828-ac02-3cd6b4d083cb", short_code: "67uqc3q7", qr_created_at: "2026-06-23T18:46:31.354+00:00" },
]);

/** The local walkthrough login (local stack only): scripts/lib/showcase-local-login.mjs. */
export { LOCAL_ADMIN, LOCAL_PASSWORD };
const LOCAL_NOTIFY = "northridge.notify@phase-e-showcase.invalid";

function refuse(message, code = 1) {
  console.error(`\n${TAG} REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(code);
}

const same = (a, b) => (a === null || b === null ? a === b : Date.parse(a) === Date.parse(b));

/** What the target needs, from its current rows (pure; tested). */
export function bootstrapChanges({ assets, qrLinks, pages, scans, ownedScanIds }) {
  const changes = { insertAssets: [], alignAssets: [], insertQr: [], alignQr: [], insertPages: [], deleteScans: [], problems: [] };
  const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
  const assetsById = byId(assets);
  const qrById = byId(qrLinks);
  const showcaseIds = new Set(PRODUCTION_ROWS.map((r) => r.asset_id));
  for (const p of PRODUCTION_ROWS) {
    const asset = assetsById.get(p.asset_id);
    const codeClash = assets.find((a) => a.asset_code === p.asset_code && a.id !== p.asset_id);
    if (codeClash) changes.problems.push(`another asset already uses the code ${p.asset_code}`);
    if (!asset) changes.insertAssets.push(p);
    else if (asset.asset_code !== p.asset_code) changes.problems.push(`asset ${p.asset_id} holds the code ${asset.asset_code}, not ${p.asset_code}`);
    else if (!same(asset.created_at, p.asset_created_at)) changes.alignAssets.push(p);
    const qr = qrById.get(p.qr_link_id);
    const shortClash = qrLinks.find((q) => q.short_code === p.short_code && q.id !== p.qr_link_id);
    if (shortClash) changes.problems.push(`another QR row already uses the short code ${p.short_code}`);
    if (!qr) changes.insertQr.push(p);
    else if (qr.short_code !== p.short_code || qr.asset_id !== p.asset_id) changes.problems.push(`QR row ${p.qr_link_id} is not ${p.short_code} on ${p.asset_code}`);
    else if (!same(qr.created_at, p.qr_created_at)) changes.alignQr.push(p);
    if (!pages.some((pg2) => pg2.asset_id === p.asset_id)) changes.insertPages.push(p);
  }
  const owned = new Set(ownedScanIds);
  changes.deleteScans = scans.filter((s) => showcaseIds.has(s.asset_id) && !owned.has(s.id)).map((s) => s.id);
  return changes;
}

async function connectTarget(target) {
  if (target === "local") {
    const status = readLocalStackStatus(REPO);
    assertLoopbackTargets({ "API URL": status.apiUrl, "DB URL": status.dbUrl });
    const client = new pg.Client({ connectionString: status.dbUrl });
    await client.connect();
    return { client, host: new URL(status.dbUrl).hostname, admin: createClient(status.apiUrl, status.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) };
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try {
    assertTarget("staging", { supabaseUrl, expectedStagingRef: STAGING_REF });
  } catch (err) {
    refuse(err.message);
  }
  let config;
  try {
    config = stagingDbConfig(process.env);
  } catch (err) {
    refuse(err.message);
  }
  const { describe, ...pgConfig } = config;
  const client = new pg.Client({ ...pgConfig, statement_timeout: 60_000 });
  try {
    await client.connect();
    await assertStagingDatabase(client);
  } catch (err) {
    await client.end().catch(() => {});
    refuse(String(err.code ?? err.message).slice(0, 200));
  }
  return { client, host: describe, admin: null };
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => a.startsWith("--target="))?.split("=")[1];
  const apply = args.includes("--apply");
  for (const a of args) if (!/^--target=(local|staging|production)$/.test(a) && a !== "--apply") refuse(`unknown argument ${a.split("=")[0]}`, 2);
  if (target === "production") refuse("Production is never bootstrapped: the four assets and their QR rows already exist there and stay untouched");
  if (!["local", "staging"].includes(target)) refuse("--target must be local or staging", 2);

  const dataset = JSON.parse(readFileSync(path.join(REPO, DATASET_FILE), "utf8"));
  const conn = await connectTarget(target);
  const { client } = conn;
  try {
    await client.query("set timezone = 'UTC'");
    const rows = async (sql, params) => (await client.query(sql, params)).rows;
    const assets = await rows("select id, asset_code, created_at::text as created_at from public.assets where organization_id = $1", [NORTHRIDGE]);
    const qrLinks = await rows("select id, asset_id, short_code, created_at::text as created_at from public.qr_links where organization_id = $1", [NORTHRIDGE]);
    const pages = await rows("select id, asset_id from public.equipment_pages where organization_id = $1", [NORTHRIDGE]);
    const ids = PRODUCTION_ROWS.map((p) => p.asset_id);
    const scans = await rows("select id, asset_id from public.scan_events where organization_id = $1 and asset_id = any($2::uuid[])", [NORTHRIDGE, ids]);
    const changes = bootstrapChanges({ assets, qrLinks, pages, scans, ownedScanIds: ownedIds(dataset).scan_events });
    if (changes.problems.length) refuse(changes.problems.join("; "));

    console.log(`\n${TAG} ${target.toUpperCase()} (host: ${conn.host}) — ${apply ? "APPLYING" : "DRY RUN (add --apply to write)"}`);
    console.log(`  assets to add: ${changes.insertAssets.map((p) => p.asset_code).join(", ") || "none"} · creation times to align: ${changes.alignAssets.map((p) => p.asset_code).join(", ") || "none"}`);
    console.log(`  QR rows to add: ${changes.insertQr.map((p) => p.short_code).join(", ") || "none"} · creation times to align: ${changes.alignQr.map((p) => p.short_code).join(", ") || "none"}`);
    console.log(`  page rows to add: ${changes.insertPages.map((p) => p.asset_code).join(", ") || "none"} · old scans to delete on the four assets: ${changes.deleteScans.length}`);

    let localAdmin = "skipped (hosted target)";
    if (target === "local") {
      const profile = await rows("select id, role, organization_id from public.profiles where id = $1", [LOCAL_ADMIN.profileId]);
      const org = await rows("select return_notification_mode, notification_email from public.organizations where id = $1", [NORTHRIDGE]);
      localAdmin = profile.length ? "present" : "to create";
      console.log(`  local admin login: ${localAdmin} · local notification mode: ${org[0]?.return_notification_mode} -> instant_renter (address .invalid)`);
    }
    if (!apply) return;

    if (target === "local" && localAdmin === "to create") {
      const existing = await conn.admin.auth.admin.getUserById(LOCAL_ADMIN.authId);
      if (!existing.data?.user) {
        const { error } = await conn.admin.auth.admin.createUser({ id: LOCAL_ADMIN.authId, email: LOCAL_ADMIN.email, password: LOCAL_PASSWORD, email_confirm: true });
        if (error) throw new Error(`could not create the local admin login (${error.message})`);
      }
    }
    await client.query("begin");
    try {
      for (const p of changes.insertAssets) {
        await client.query(
          `insert into public.assets (id, organization_id, asset_code, asset_name, category, public_status, created_at, updated_at) values ($1, $2, $3, $4, $5, 'public', $6, $6)`,
          [p.asset_id, NORTHRIDGE, p.asset_code, p.asset_name, p.category, p.asset_created_at]
        );
      }
      for (const p of changes.alignAssets) await client.query("update public.assets set created_at = $2 where id = $1 and organization_id = $3", [p.asset_id, p.asset_created_at, NORTHRIDGE]);
      for (const p of changes.insertQr) {
        await client.query(
          `insert into public.qr_links (id, organization_id, asset_id, short_code, public_url, status, created_at, updated_at) values ($1, $2, $3, $4, $5, 'active', $6, $6)`,
          [p.qr_link_id, NORTHRIDGE, p.asset_id, p.short_code, `https://app.example.com/t/${p.short_code}`, p.qr_created_at]
        );
      }
      for (const p of changes.alignQr) await client.query("update public.qr_links set created_at = $2 where id = $1 and organization_id = $3", [p.qr_link_id, p.qr_created_at, NORTHRIDGE]);
      for (const p of changes.insertPages) {
        await client.query(
          `insert into public.equipment_pages (id, asset_id, organization_id, headline, is_published, created_at, updated_at) values ($1, $2, $3, $4, true, $5, $5)`,
          [randomUUID(), p.asset_id, NORTHRIDGE, p.asset_name, p.asset_created_at]
        );
      }
      if (changes.deleteScans.length) {
        const res = await client.query("delete from public.scan_events where organization_id = $1 and id = any($2::uuid[])", [NORTHRIDGE, changes.deleteScans]);
        if (res.rowCount !== changes.deleteScans.length) throw new Error("the scan deletion did not match the planned rows");
      }
      if (target === "local") {
        await client.query(
          `insert into public.profiles (id, auth_user_id, organization_id, name, email, role, status) values ($1, $2, $3, $4, $5, 'customer_admin', 'active') on conflict (id) do nothing`,
          [LOCAL_ADMIN.profileId, LOCAL_ADMIN.authId, NORTHRIDGE, LOCAL_ADMIN.name, LOCAL_ADMIN.email]
        );
        await client.query("update public.organizations set return_notification_mode = 'instant_renter', notification_email = $2 where id = $1 and (return_notification_mode is distinct from 'instant_renter' or notification_email is distinct from $2)", [NORTHRIDGE, LOCAL_NOTIFY]);
      }
      const qrPrimary = await rows("select count(*)::int as n from public.qr_links where id = any($1::uuid[]) and status = 'active' and is_production_primary", [PRODUCTION_ROWS.map((p) => p.qr_link_id)]);
      if (qrPrimary[0].n !== PRODUCTION_ROWS.length) throw new Error("the four showcase QR rows are not all active production-primary rows");
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    }
    console.log(`  done: ${changes.insertAssets.length + changes.alignAssets.length + changes.insertQr.length + changes.alignQr.length + changes.insertPages.length} row change(s), ${changes.deleteScans.length} scan(s) deleted\n`);
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\n${TAG} FAILED: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}\n`);
    process.exitCode = 1;
  });
}
