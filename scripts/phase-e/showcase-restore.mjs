#!/usr/bin/env node
/**
 * Engineering Phase E1 — restore a recovery package into a LOCAL target and prove it, or manage the standalone target.
 *
 *   npm.cmd run phase-e:restore -- stack --archive=<abs dir> [--replace-local] [--fail-after=<table>]
 *   npm.cmd run phase-e:restore -- standalone-up
 *   npm.cmd run phase-e:restore -- standalone --archive=<abs dir> [--replace-local] [--fail-after=<table>]
 *   npm.cmd run phase-e:restore -- standalone-down
 *
 * TWO LOCAL TARGETS, SPLIT BY DATA (operator decision, docs/phase-e/DEMO_RECOVERY_RUNBOOK.md):
 *   stack       the repo's Supabase stack. Docker Desktop publishes it on all interfaces, so it receives SYNTHETIC and
 *               staging-QA packages only; a package exported from Production is refused here. Rows, auth users and
 *               Storage objects are restored and verified (objects re-downloaded and re-hashed).
 *   standalone  a temporary Postgres container (the cached Supabase image) bound explicitly to 127.0.0.1:55432 with its
 *               data on tmpfs. Its listeners are verified loopback-only before anything is loaded. It is the only place
 *               a real package is restored. It has no Storage service: object bytes are verified by SHA-256 from the
 *               package; upload mechanics are proven on the stack with synthetic and QA packages.
 *
 * RESTORE: one transaction — an existing local copy of the organization is deleted with triggers ON (cascades fire),
 * then `session_replication_role = replica` and every table is inserted exactly with jsonb_populate_recordset in graph
 * order; integrity checks, active-pointer checks and per-table row hashes (to_jsonb, UTC) must all pass before COMMIT.
 * `--fail-after` aborts mid-restore to prove the rollback. Anonymous route resolution is then re-checked under RLS.
 *
 * Never contacts a hosted project: both the API URL and the DB URL are loopback-checked (scripts/lib/local-stack.mjs).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import {
  STANDALONE_CONTAINER,
  STANDALONE_PASSWORD,
  STANDALONE_PORT,
  applyGrantParity,
  assertLoopbackTargets,
  assertStandaloneLoopback as assertListenersLoopback,
  readLocalStackStatus,
  runReplicaCanaries,
  standaloneDbUrl,
  standalonePostgresPlan,
  windowsListeners,
} from "../lib/local-stack.mjs";
import { bucketRuleViolations, canonicalJson, columnSetProblems, sha256, tableHash, verifyArchiveDir } from "../lib/showcase-archive.mjs";
import { redactionProblems } from "../lib/showcase-inventory.mjs";
import { integrityChecks, scopeWhere } from "../lib/tenant-graph.mjs";

const TAG = "[restore]";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GRAPH = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/manifests/tenant-dependency-graph.json"), "utf8"));
/** Local throwaway password for restored identities on the loopback stack. Not a secret; never printed. */
const LOCAL_USER_PASSWORD = process.env.E2E_PASSWORD || "phase-e-local-restore-only";
const STACK_DB_CONTAINER = "supabase_db_QR_Asset_Tags";

class RestoreStop extends Error {}

function refuse(message, code = 1) {
  console.error(`\n${TAG} REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (!["stack", "standalone", "standalone-up", "standalone-down"].includes(mode)) {
    refuse("first argument must be stack, standalone, standalone-up or standalone-down", 2);
  }
  const args = { mode, archive: null, replaceLocal: false, failAfter: null };
  for (const raw of rest) {
    if (raw === "--replace-local") args.replaceLocal = true;
    else {
      const m = /^--(archive|fail-after)=(.+)$/.exec(raw);
      if (!m) refuse(`unknown argument ${JSON.stringify(String(raw).split("=")[0].slice(0, 40))}`, 2);
      args[m[1] === "fail-after" ? "failAfter" : "archive"] = m[2].trim();
    }
  }
  if (args.failAfter && !GRAPH.insert_order.includes(args.failAfter)) refuse("--fail-after must name a table in the graph's insert order", 2);
  return args;
}

const q = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

// ---------------------------------------------------------------------------------------------------------------------
// Standalone container
// ---------------------------------------------------------------------------------------------------------------------

function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
}

function assertStandaloneLoopback() {
  try {
    assertListenersLoopback();
  } catch (err) {
    throw new RestoreStop(err.message);
  }
}

async function standaloneUp() {
  const running = docker(["ps", "--filter", `name=^${STANDALONE_CONTAINER}$`, "--format", "{{.Names}}"]).trim();
  if (!running) docker(standalonePostgresPlan(STANDALONE_PASSWORD));
  try {
    const deadline = Date.now() + 90_000;
    for (;;) {
      let ready = "";
      try {
        ready = docker(["exec", STANDALONE_CONTAINER, "pg_isready", "-U", "postgres", "-h", "localhost"]);
      } catch {
        ready = "";
      }
      if (/accepting/.test(ready)) break;
      if (Date.now() > deadline) throw new RestoreStop("the standalone database did not become ready");
      await new Promise((r) => setTimeout(r, 2000));
    }
    const published = docker(["inspect", STANDALONE_CONTAINER, "--format", "{{json .NetworkSettings.Ports}}"]);
    if (/"HostIp":"(0\.0\.0\.0|::)"/.test(published)) throw new RestoreStop("Docker published the standalone database beyond loopback");
    assertStandaloneLoopback();

    const client = new pg.Client({ connectionString: standaloneDbUrl(STANDALONE_PASSWORD) });
    await client.connect();
    try {
      const tables = await client.query(`select count(*)::int as n from pg_tables where schemaname = 'public'`);
      if (tables.rows[0].n === 0) {
        // The schema comes from the repo's local stack (synthetic data only): public schema, structure and grants.
        // Dropped: psql meta-commands (pg_dump 17.6+ wraps the script in \restrict … \unrestrict; not SQL), the
        // pre-existing public schema, and ALTER DEFAULT PRIVILEGES (only affects objects created later, and needs a
        // superuser this throwaway target does not use).
        const dump = docker(["exec", STACK_DB_CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only", "--schema=public", "--no-owner"], {
          maxBuffer: 64 * 1024 * 1024,
        })
          .split("\n")
          .filter((line) => !line.startsWith("\\") && line !== "CREATE SCHEMA public;" && !line.startsWith("ALTER DEFAULT PRIVILEGES "))
          .join("\n");
        await client.query(dump);
      }
      const loaded = await client.query(`select count(*)::int as n from pg_tables where schemaname = 'public'`);
      console.log(`${TAG} standalone target ready on 127.0.0.1:${STANDALONE_PORT} (loopback-only verified; ${loaded.rows[0].n} public tables; data on tmpfs)`);
    } finally {
      await client.end();
    }
  } catch (err) {
    // Leave nothing listening after a failed start.
    try {
      docker(["stop", STANDALONE_CONTAINER]);
    } catch {
      /* already gone */
    }
    throw err;
  }
}

function standaloneDown() {
  const running = docker(["ps", "--filter", `name=^${STANDALONE_CONTAINER}$`, "--format", "{{.Names}}"]).trim();
  if (running) docker(["stop", STANDALONE_CONTAINER]);
  const left = windowsListeners(STANDALONE_PORT).length;
  console.log(`${TAG} standalone target stopped and removed (tmpfs data gone); listeners left on ${STANDALONE_PORT}: ${left}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Package loading
// ---------------------------------------------------------------------------------------------------------------------

function loadPackage(dir) {
  if (!dir || !path.isAbsolute(dir)) throw new RestoreStop("--archive=<absolute package directory> is required");
  const verified = verifyArchiveDir(dir);
  if (!verified.ok) throw new RestoreStop(`the package failed verification: ${verified.problems.slice(0, 6).join("; ")}`);
  const read = (rel) => JSON.parse(readFileSync(path.join(dir, ...rel.split("/")), "utf8"));
  const manifest = verified.manifest;
  if (manifest.graph.sha256 !== GRAPH.graph_sha256) {
    throw new RestoreStop(
      "the package was taken under a different schema graph. Reset the local database to the package's migrations, restore, " +
        "then migrate forward (runbook); this tool restores only into the current schema."
    );
  }
  const rows = Object.fromEntries(Object.keys(manifest.tables).map((t) => [t, read(`rows/${t}.json`)]));
  return {
    dir,
    manifest,
    manifestSha: sha256(readFileSync(path.join(dir, "manifest.json"))),
    rows,
    identity: read("identity.json"),
    objects: read("objects.json"),
    references: read("references.json"),
    routes: read("routes.json"),
  };
}

async function targetColumns(client) {
  const res = await client.query(
    `select table_name, column_name from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`
  );
  const out = {};
  for (const r of res.rows) (out[r.table_name] ??= []).push(r.column_name);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------------------------------------------------

/** Expected active-pointer inconsistencies computed from the package itself (the restore must reproduce the source). */
function pointerFindings(rows) {
  const sessions = new Map((rows.asset_rental_sessions ?? []).map((s) => [s.id, s]));
  let pointerWithoutActiveSession = 0;
  for (const a of rows.assets ?? []) {
    if (!a.active_rental_session_id) continue;
    const s = sessions.get(a.active_rental_session_id);
    if (!s || s.asset_id !== a.id || s.status !== "active") pointerWithoutActiveSession++;
  }
  const pointers = new Set((rows.assets ?? []).map((a) => a.active_rental_session_id).filter(Boolean));
  const activeWithoutPointer = (rows.asset_rental_sessions ?? []).filter((s) => s.status === "active" && !pointers.has(s.id)).length;
  return { pointerWithoutActiveSession, activeWithoutPointer };
}

async function verifyRestored(client, pkg) {
  const orgId = pkg.manifest.source.organization_id;
  const failures = [];
  const checks = integrityChecks(GRAPH);
  for (const check of checks) {
    const n = (await client.query(check.sql, [orgId])).rows[0].n;
    if (n !== 0) failures.push(`${check.name}: ${n}`);
  }
  const expected = pointerFindings(pkg.rows);
  const live = {
    pointerWithoutActiveSession: (
      await client.query(
        `select count(*)::int as n from public.assets a where a.organization_id = $1 and a.active_rental_session_id is not null and not exists
           (select 1 from public.asset_rental_sessions s where s.id = a.active_rental_session_id and s.asset_id = a.id and s.status = 'active')`,
        [orgId]
      )
    ).rows[0].n,
    activeWithoutPointer: (
      await client.query(
        `select count(*)::int as n from public.asset_rental_sessions s where s.organization_id = $1 and s.status = 'active' and not exists
           (select 1 from public.assets a where a.id = s.asset_id and a.active_rental_session_id = s.id)`,
        [orgId]
      )
    ).rows[0].n,
  };
  if (canonicalJson(live) !== canonicalJson(expected)) failures.push(`active pointers differ from the package (${JSON.stringify(live)} vs ${JSON.stringify(expected)})`);

  const mismatches = [];
  for (const table of Object.keys(pkg.manifest.tables)) {
    const res = await client.query(`select to_jsonb(t) as j from public.${q(table)} t where ${scopeWhere(table, GRAPH.classes)} order by t.id`, [orgId]);
    const restored = res.rows.map((r) => r.j);
    if (restored.length !== pkg.manifest.tables[table].rows || tableHash(restored) !== pkg.manifest.tables[table].table_hash) mismatches.push(table);
  }
  if (mismatches.length > 0) failures.push(`row hashes differ in: ${mismatches.join(", ")}`);
  return { failures, integrityChecks: checks.length, pointers: live, tablesHashed: Object.keys(pkg.manifest.tables).length };
}

/**
 * The four reads of lib/public/resolve.ts#resolvePublicEquipment, with the same columns, run as `anon` so RLS and the
 * column grants decide exactly as they do for a visitor. PostgREST's maybeSingle() yields nothing unless exactly one
 * row matches, so the same rule applies here.
 */
const PUBLIC_RESOLUTION = [
  ["link", `select id, asset_id, organization_id from public.qr_links where short_code = $1`, (route) => [route.short_code]],
  [
    "asset",
    `select asset_code, asset_name, category, make, model, cover_image_url, support_phone_override, support_email_override, active_rental_session_id, return_inspection_template_key, return_inspection_template_id from public.assets where id = $1`,
    (_, link) => [link.asset_id],
  ],
  [
    "page",
    `select headline, quick_start_text, safety_notes, fuel_power_notes, return_notes, troubleshooting_notes, emergency_notes from public.equipment_pages where asset_id = $1`,
    (_, link) => [link.asset_id],
  ],
  ["org", `select name, logo_url, primary_color, support_phone, support_email, powered_by_label from public.organizations where id = $1`, (_, link) => [link.organization_id]],
];

/** Anonymous resolution of every route under RLS, compared with what the package says should resolve. */
async function anonRouteChecks(client, pkg) {
  const assets = new Map((pkg.rows.assets ?? []).map((a) => [a.id, a]));
  const pages = new Map((pkg.rows.equipment_pages ?? []).map((p) => [p.asset_id, p]));
  const org = (pkg.rows.organizations ?? [])[0];
  const mismatches = [];
  for (const route of pkg.routes) {
    const asset = assets.get(route.asset_id);
    const page = pages.get(route.asset_id);
    const expected =
      route.status === "active" && asset?.public_status === "public" && !asset?.archived_at && page?.is_published === true && org?.status === "active";
    await client.query("begin");
    let resolved = true;
    try {
      await client.query("set local role anon");
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      let link = null;
      for (const [step, sql, params] of PUBLIC_RESOLUTION) {
        const rows = (await client.query(sql, params(route, link))).rows;
        if (rows.length !== 1) {
          resolved = false;
          break;
        }
        if (step === "link") link = rows[0];
      }
    } finally {
      await client.query("rollback");
    }
    if (resolved !== expected) mismatches.push(`${route.protected ? "protected " : ""}route ${route.short_code}: resolved=${resolved}, expected=${expected}`);
  }
  return { checked: pkg.routes.length, protectedChecked: pkg.routes.filter((r) => r.protected).length, mismatches };
}

// ---------------------------------------------------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------------------------------------------------

function identityRows(pkg) {
  const own = (pkg.rows.profiles ?? []).map((p) => ({ profileId: p.id, authUserId: p.auth_user_id, external: null }));
  const external = pkg.identity.map((p) => ({ profileId: p.id, authUserId: p.auth_user_id, external: p }));
  return [...own, ...external];
}

async function restoreRows(client, pkg, { replaceLocal, failAfter, sqlIdentities }) {
  const orgId = pkg.manifest.source.organization_id;
  const exists = (await client.query(`select count(*)::int as n from public.organizations where id = $1`, [orgId])).rows[0].n > 0;
  if (exists && !replaceLocal) throw new RestoreStop("the local target already holds this organization; pass --replace-local to replace it");
  const identities = identityRows(pkg);
  await client.query("begin");
  try {
    await client.query("set local timezone = 'UTC'");
    if (exists) await client.query(`delete from public.organizations where id = $1`, [orgId]); // triggers on: cascades fire
    await client.query("set local session_replication_role = replica");
    if (sqlIdentities) {
      const ids = identities.map((i) => i.authUserId);
      await client.query(`delete from auth.users where id = any($1::uuid[])`, [ids]);
      for (const i of identities) {
        await client.query(
          `insert into auth.users (id, email, aud, role, created_at, updated_at) values ($1, $2, 'authenticated', 'authenticated', now(), now())`,
          [i.authUserId, `${i.profileId}@restore.invalid`]
        );
      }
    }
    for (const i of identities.filter((x) => x.external)) {
      await client.query(
        `insert into public.profiles (id, auth_user_id, organization_id, name, email, role, status)
         values ($1, $2, $3, null, null, $4, $5) on conflict (id) do nothing`,
        [i.external.id, i.external.auth_user_id, i.external.organization_id, i.external.role, i.external.status ?? "active"]
      );
    }
    for (const table of GRAPH.insert_order) {
      const rows = pkg.rows[table] ?? [];
      if (rows.length > 0) {
        await client.query(`insert into public.${q(table)} select * from jsonb_populate_recordset(null::public.${q(table)}, $1::jsonb)`, [JSON.stringify(rows)]);
      }
      if (failAfter === table) throw new RestoreStop(`--fail-after=${table}: aborting inside the transaction to prove the rollback`);
    }
    const verification = await verifyRestored(client, pkg);
    if (verification.failures.length > 0) throw new RestoreStop(`verification failed before commit: ${verification.failures.slice(0, 6).join("; ")}`);
    await client.query("commit");
    return { replaced: exists, verification };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

async function restoreStackStorage(admin, client, pkg) {
  const orgId = pkg.manifest.source.organization_id;
  // Replace any local objects under the organization prefix (local only).
  for (const bucket of ["submissions", "documents", "public-assets"]) {
    const stale = [];
    const pending = [`org/${orgId}`];
    while (pending.length > 0) {
      const prefix = pending.pop();
      const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      if (error) throw new Error(`could not list the local ${bucket} bucket`);
      for (const entry of data ?? []) (entry.id ? stale : pending).push(`${prefix}/${entry.name}`);
    }
    for (let i = 0; i < stale.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(stale.slice(i, i + 100));
      if (error) throw new Error(`could not clear local ${bucket} objects`);
    }
  }
  const buckets = Object.fromEntries(
    (await client.query(`select id, file_size_limit, allowed_mime_types from storage.buckets`)).rows.map((b) => [b.id, b])
  );
  const violations = bucketRuleViolations(pkg.objects, buckets);
  const widened = [...new Set(violations.map((v) => v.bucket))];
  const original = Object.fromEntries(widened.map((b) => [b, buckets[b]]));
  for (const bucket of widened) {
    await client.query(`update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = $1`, [bucket]);
  }
  let uploaded = 0;
  let verified = 0;
  try {
    for (const object of pkg.objects) {
      const bytes = readFileSync(path.join(pkg.dir, "objects", object.sha256));
      const seconds = /max-age=(\d+)/.exec(String(object.cacheControl ?? ""))?.[1] ?? "3600";
      const { error } = await admin.storage
        .from(object.bucket)
        .upload(object.path, bytes, { contentType: object.mimetype ?? "application/octet-stream", cacheControl: seconds, upsert: false });
      if (error) throw new Error(`could not upload one ${object.bucket} object (${error.message})`);
      uploaded++;
      const back = await admin.storage.from(object.bucket).download(object.path);
      if (back.error || sha256(Buffer.from(await back.data.arrayBuffer())) !== object.sha256) throw new Error(`a re-downloaded ${object.bucket} object does not match its hash`);
      verified++;
    }
  } finally {
    for (const bucket of widened) {
      const o = original[bucket];
      await client.query(`update storage.buckets set file_size_limit = $2, allowed_mime_types = $3 where id = $1`, [bucket, o.file_size_limit, o.allowed_mime_types]);
    }
  }
  const after = Object.fromEntries(
    (await client.query(`select id, file_size_limit, allowed_mime_types from storage.buckets where id = any($1)`, [widened])).rows.map((b) => [b.id, b])
  );
  const reverted = widened.every((b) => canonicalJson(after[b]) === canonicalJson(original[b]));
  if (!reverted) throw new Error("local bucket rules were not restored to their migration values");
  // Pinned dangling references must still be missing (no bytes exist for them).
  let stillMissing = 0;
  for (const ref of pkg.manifest.missing_references ?? []) {
    const folder = ref.path.split("/").slice(0, -1).join("/");
    const name = ref.path.split("/").pop();
    const { data } = await admin.storage.from(ref.bucket).list(folder, { limit: 1000, search: name });
    if (!(data ?? []).some((e) => e.name === name)) stillMissing++;
  }
  return { mode: "uploaded-and-verified", uploaded, verified, widenedBuckets: widened, rulesReverted: reverted, missingReferences: (pkg.manifest.missing_references ?? []).length, stillMissing };
}

function verifyObjectBytes(pkg) {
  let verified = 0;
  for (const object of pkg.objects) {
    const file = path.join(pkg.dir, "objects", object.sha256);
    if (existsSync(file) && sha256(readFileSync(file)) === object.sha256) verified++;
  }
  return { mode: "hash-verified-from-package", objects: pkg.objects.length, verified };
}

function writeReports(pkg, report) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const reportDir = path.join(pkg.dir, "restore-reports");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(path.join(reportDir, `${stamp}-${report.target}.json`), `${JSON.stringify(report, null, 2)}\n`);
  const summaryFile = path.join(REPO, "docs/phase-e/archives", `${pkg.manifest.archive_id}.json`);
  if (!existsSync(summaryFile)) return;
  const summary = JSON.parse(readFileSync(summaryFile, "utf8"));
  const entry = {
    at: report.at,
    target: report.target,
    ok: report.ok,
    replaced_local_copy: report.replaced,
    integrity_checks: report.verification.integrityChecks,
    tables_hash_verified: report.verification.tablesHashed,
    routes_checked: report.routes.checked,
    protected_routes_checked: report.routes.protectedChecked,
    route_mismatches: report.routes.mismatches.length,
    storage: report.storage,
  };
  summary.restore_rehearsals = [...(summary.restore_rehearsals ?? []), entry];
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  if (redactionProblems(serialized).length === 0) writeFileSync(summaryFile, serialized);
}

async function runRestore(args) {
  const pkg = loadPackage(args.archive);
  const target = args.mode;
  if (target === "stack" && pkg.manifest.source.target === "production") {
    throw new RestoreStop("a package exported from Production restores only into the standalone loopback target, never the all-interfaces stack");
  }
  let dbUrl;
  let admin = null;
  let stackStatus = null;
  if (target === "stack") {
    stackStatus = readLocalStackStatus(REPO);
    dbUrl = stackStatus.dbUrl;
    admin = createClient(stackStatus.apiUrl, stackStatus.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  } else {
    assertStandaloneLoopback();
    dbUrl = standaloneDbUrl(STANDALONE_PASSWORD);
  }
  assertLoopbackTargets({ "DB URL": dbUrl, "API URL": stackStatus?.apiUrl });

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  const createdUsers = [];
  try {
    const columnProblems = columnSetProblems(pkg.rows, await targetColumns(client));
    if (columnProblems.length > 0) throw new RestoreStop(`column sets differ: ${columnProblems.slice(0, 6).join("; ")}`);
    const canary = await runReplicaCanaries(client);
    if (!canary.replicaRole || !canary.replicaKeepsGovernance || canary.alwaysTriggers !== 0) {
      throw new RestoreStop(`restore canaries failed: ${JSON.stringify(canary)}`);
    }
    if (target === "stack") {
      await applyGrantParity(client, REPO);
      // Create only the identities that do not exist yet: deleting a user would cascade to its profile outside the
      // restore transaction. Users created here are removed again if the restore fails.
      for (const i of identityRows(pkg)) {
        const existing = await admin.auth.admin.getUserById(i.authUserId);
        if (existing.data?.user) continue;
        const { error } = await admin.auth.admin.createUser({
          id: i.authUserId,
          email: `${i.profileId}@restore.invalid`,
          password: LOCAL_USER_PASSWORD,
          email_confirm: true,
        });
        if (error) throw new RestoreStop(`could not create a local auth user (${error.message})`);
        createdUsers.push(i.authUserId);
      }
    }
    const { replaced, verification } = await restoreRows(client, pkg, {
      replaceLocal: args.replaceLocal,
      failAfter: args.failAfter,
      sqlIdentities: target === "standalone",
    });
    const routes = await anonRouteChecks(client, pkg);
    const storage = target === "stack" ? await restoreStackStorage(admin, client, pkg) : verifyObjectBytes(pkg);
    const storageOk =
      target === "stack"
        ? storage.uploaded === pkg.objects.length && storage.verified === pkg.objects.length && storage.stillMissing === storage.missingReferences
        : storage.verified === storage.objects;
    const report = {
      archive_id: pkg.manifest.archive_id,
      manifest_sha256: pkg.manifestSha,
      target,
      at: new Date().toISOString(),
      replaced,
      canary,
      verification,
      routes,
      storage,
      ok: verification.failures.length === 0 && routes.mismatches.length === 0 && storageOk,
    };
    writeReports(pkg, report);
    console.log(`\n${TAG} ${target.toUpperCase()} restore of ${pkg.manifest.archive_id} — ${report.ok ? "VERIFIED" : "FAILED"}`);
    console.log(`  rows: ${Object.entries(pkg.manifest.tables).map(([t, i]) => `${t} ${i.rows}`).join(" · ")}`);
    console.log(`  integrity checks ${verification.integrityChecks} passed · ${verification.tablesHashed} tables hash-identical · pointers ${JSON.stringify(verification.pointers)}`);
    console.log(`  routes ${routes.checked} checked under anon RLS (${routes.protectedChecked} protected) · mismatches ${routes.mismatches.length}`);
    for (const m of routes.mismatches) console.log(`    - ${m}`);
    console.log(`  storage: ${JSON.stringify(storage)}\n`);
    process.exitCode = report.ok ? 0 : 1;
  } catch (err) {
    if (target === "stack") for (const id of createdUsers) await admin.auth.admin.deleteUser(id).catch(() => null);
    throw err;
  } finally {
    await client.end();
  }
}

const args = parseArgs(process.argv.slice(2));
try {
  if (args.mode === "standalone-up") await standaloneUp();
  else if (args.mode === "standalone-down") standaloneDown();
  else await runRestore(args);
} catch (err) {
  const message = String(err?.message ?? err).split("\n")[0].slice(0, 300);
  console.error(`\n${TAG} ${err instanceof RestoreStop ? "STOPPED" : "FAILED"}: ${message}\n`);
  process.exitCode = 1;
}
