#!/usr/bin/env node
/**
 * Engineering Phase E1 / E2B — the guarded showcase reset interface. Dry runs on any target; applies on loopback
 * targets, and on STAGING for the synthetic dataset kinds only. Production applies are refused before any connection.
 *
 *   npm.cmd run phase-e:reset:production -- manifest --kind=noop|draft-e2c|showcase --org=<Northridge id> --out=<abs file>
 *   npm.cmd run phase-e:reset:production -- plan --manifest=<abs file>
 *   npm.cmd run phase-e:reset:staging -- manifest|plan|apply …        apply: dataset kinds, --approved-plan required
 *   npm.cmd run phase-e:reset:local -- manifest|plan|apply …          the repo's local stack (synthetic data)
 *   npm.cmd run phase-e:reset:standalone -- manifest|plan|apply …     the loopback-only restore container
 *   … manifest --kind=restore --archive=<abs package dir> [--cutover=<abs cutover manifest>]
 *   … manifest --kind=showcase [--scans=keep|remove-showcase] [--dataset=<abs dataset file>]   (E2B first application)
 *   … manifest --kind=presenter|refresh [--remove=<abs JSON {table: [ids]}>] [--dataset=<abs file>] (composed in the lock)
 *   … apply --manifest=<abs file> [--approved-plan=<abs plan file>] [--fail-at=writes|postchecks]
 *
 * ONE ORGANIZATION: Northridge, by exact id (no wildcard, no other tenant, no public endpoint). Hosted targets are read
 * through the service role's PostgREST with a read-only client, after their live schema is matched against the tracked
 * dependency graph. A STAGING apply (E2B dataset kinds only) connects to the staging database through the guarded URL
 * in PHASE_E_STAGING_DB_URL (scripts/lib/showcase-target.mjs): the API URL must be staging, the live schema must match the
 * graph, the staging-only probe row must exist and the trigger / job catalog must be the reviewed one — all before the
 * transaction begins. The URL is never printed.
 *
 * APPLY is one transaction with triggers ON: lock the organization row (new rows that reference it wait; other tenants
 * are unaffected) and its rows, compose the presenter / refresh manifest from those locked rows, plan, check the plan
 * against --approved-plan, run the emitted guards, writes and post-checks, commit — or roll back on any refusal or
 * failure. Staged Storage objects are uploaded first, only when missing, never overwritten or deleted. A fresh re-plan
 * afterwards must be all KEEP (convergence).
 *
 * Manifests, plans and SQL carry row data, so they are written OUTSIDE the repository and outside OneDrive. For hosted
 * targets a counts-only plan summary is also written to docs/phase-e/archives/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { assertTarget } from "../lib/env-target.mjs";
import { STANDALONE_PASSWORD, assertLoopbackTargets, assertStandaloneLoopback, readLocalStackStatus, standaloneDbUrl } from "../lib/local-stack.mjs";
import { archiveRootProblems, sha256, verifyArchiveDir } from "../lib/showcase-archive.mjs";
import { composeDatasetReset, composeShowcase, datasetStage, e2aOverlay, rollbackScanRemovals } from "../lib/showcase-compose.mjs";
import { DATASET_FILE, DATASET_TABLES, MEDIA_FILE, ownedIds, retiredIds } from "../lib/showcase-dataset.mjs";
import { redactionProblems } from "../lib/showcase-inventory.mjs";
import {
  IN_LOCK_KINDS,
  OWNED_KINDS,
  RESET_MANIFEST_SCHEMA,
  buildManifest,
  draftE2cDesired,
  emitResetSql,
  noopDesired,
  planReset,
  planSummary,
  restoreDesired,
} from "../lib/showcase-reset.mjs";
import { STAGING_REF, assertStagingDatabase, stagingDbConfig } from "../lib/showcase-target.mjs";
import { compareWithOpenApi, openApiTables } from "../lib/tenant-graph.mjs";
import { fetchOpenApi, pgIdentity, pgTables, postgrestIdentity, postgrestTables, readOnlyClient } from "../lib/tenant-snapshot.mjs";

const TAG = "[reset]";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GRAPH = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/manifests/tenant-dependency-graph.json"), "utf8"));
const PROTECTED = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/manifests/protected-demo-routes.json"), "utf8"));
const IMPORT_PACKS = ["bobcat.e20.b3bl-canopy", "cat.301-5.canopy", "bigtex.35sa.12", "bigtex.14lp.14"];
const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";
const TARGETS = ["local", "standalone", "staging", "production"];
const LOOPBACK = new Set(["local", "standalone"]);
const COMMANDS = ["manifest", "plan", "apply"];
const FLAGS = ["target", "kind", "org", "out", "manifest", "archive", "cutover", "name", "fail-at", "remove", "approved-plan", "scans", "dataset"];

class ResetStop extends Error {}

function refuse(message, code = 1) {
  console.error(`\n${TAG} REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(code);
}

const camel = (flag) => flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function parseArgs(argv) {
  const args = Object.fromEntries([...FLAGS.map((f) => [camel(f), null]), ["command", null]]);
  for (const raw of argv) {
    if (COMMANDS.includes(raw)) {
      if (args.command) refuse("give one command", 2);
      args.command = raw;
      continue;
    }
    const m = /^--([a-z-]+)=(.+)$/.exec(raw);
    if (!m || !FLAGS.includes(m[1])) refuse(`unknown argument ${JSON.stringify(String(raw).split("=")[0].slice(0, 40))}`, 2);
    const key = camel(m[1]);
    if (args[key] !== null) refuse(`--${m[1]} was given twice`, 2);
    args[key] = m[2].trim();
  }
  if (!TARGETS.includes(args.target)) refuse(`--target must be one of ${TARGETS.join(", ")}`, 2);
  if (!args.command) refuse(`a command is required: ${COMMANDS.join(", ")}`, 2);
  if (args.failAt && !["writes", "postchecks"].includes(args.failAt)) refuse("--fail-at must be writes or postchecks", 2);
  if (args.scans && !["keep", "remove-showcase"].includes(args.scans)) refuse("--scans must be keep or remove-showcase", 2);
  return args;
}

/** A file path for row-bearing output: absolute, outside the repository, outside OneDrive. */
function outsidePath(file, flag) {
  if (!file || !path.isAbsolute(file)) refuse(`${flag}=<absolute path> is required`, 2);
  const problems = archiveRootProblems(path.dirname(file), { repoRoot: REPO });
  if (problems.length > 0) refuse(`${flag}: ${problems.join("; ")}`);
  return file;
}

const sibling = (manifestFile, suffix) => manifestFile.replace(/\.json$/i, "") + suffix;
const writeJsonFile = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const readRepoJson = (rel) => JSON.parse(readFileSync(path.join(REPO, rel), "utf8"));

// ---------------------------------------------------------------------------------------------------------------------
// Targets and snapshots
// ---------------------------------------------------------------------------------------------------------------------

/** The hosted target's API URL and service-role key, after the target guard and the schema match. */
async function hostedApi(target) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) refuse("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (never printed).");
  let resolved;
  try {
    resolved = assertTarget(target, { supabaseUrl, expectedStagingRef: STAGING_REF });
  } catch (err) {
    refuse(err.message);
  }
  const schemaProblems = compareWithOpenApi(GRAPH, openApiTables(await fetchOpenApi(supabaseUrl, serviceRoleKey)));
  if (schemaProblems.length > 0) refuse(`the target's schema does not match the dependency graph: ${schemaProblems.slice(0, 8).join("; ")}`);
  return { supabaseUrl, serviceRoleKey, resolved };
}

async function connect(target, { forApply = false } = {}) {
  if (target === "local") {
    const status = readLocalStackStatus(REPO);
    const client = new pg.Client({ connectionString: status.dbUrl });
    await client.connect();
    await client.query("set timezone = 'UTC'");
    return { kind: "pg", client, status, apiUrl: status.apiUrl, serviceRoleKey: status.serviceRoleKey, host: new URL(status.dbUrl).hostname };
  }
  if (target === "standalone") {
    assertStandaloneLoopback();
    const dbUrl = standaloneDbUrl(STANDALONE_PASSWORD);
    assertLoopbackTargets({ "DB URL": dbUrl });
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query("set timezone = 'UTC'");
    return { kind: "pg", client, host: "127.0.0.1" };
  }
  const { supabaseUrl, serviceRoleKey, resolved } = await hostedApi(target);
  if (forApply) {
    if (target !== "staging") refuse("only the staging target takes a hosted apply");
    let config;
    try {
      config = stagingDbConfig(process.env);
    } catch (err) {
      refuse(err.message);
    }
    const { describe, ...pgConfig } = config;
    const client = new pg.Client({ ...pgConfig, statement_timeout: 120_000 });
    try {
      await client.connect();
    } catch (err) {
      refuse(`could not connect to the staging database (${String(err.code ?? err.message).slice(0, 120)}); check PHASE_E_STAGING_DB_URL and, if TLS verification fails, PHASE_E_STAGING_DB_CA_FILE`);
    }
    await client.query("set timezone = 'UTC'");
    let proof;
    try {
      proof = await assertStagingDatabase(client);
    } catch (err) {
      await client.end().catch(() => {});
      refuse(err.message);
    }
    return { kind: "pg", client, apiUrl: supabaseUrl, serviceRoleKey, host: describe, ref: resolved.ref, proof };
  }
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { kind: "postgrest", client: readOnlyClient(db), apiUrl: supabaseUrl, host: resolved.host, ref: resolved.ref };
}

async function snapshot(conn, org) {
  const t0 = new Date().toISOString();
  if (conn.kind === "pg") {
    const tables = await pgTables(conn.client, GRAPH, org, t0);
    const { identity } = await pgIdentity(conn.client, GRAPH, tables);
    return { taken_at: t0, tables, identity };
  }
  const tables = await postgrestTables(conn.client, GRAPH, org, t0);
  const { identity } = await postgrestIdentity(conn.client, GRAPH, tables);
  return { taken_at: t0, tables, identity };
}

/**
 * The tracked protected set. It describes PRODUCTION, where every registry row must exist (a missing one is refused).
 * Rehearsal targets — staging, the local stack, the standalone container — hold only the rows their data has (staging
 * and the seed lack the Production-only rows), so there the set is narrowed to the rows present.
 */
function protectedFor(target, snap) {
  const qrLinkIds = [...PROTECTED.routes, ...PROTECTED.other_northridge_qr_rows].map((r) => r.qr_link_id);
  const assetIds = PROTECTED.routes.map((r) => r.asset_id);
  if (target === "production") return { qrLinkIds, assetIds, omitted: 0 };
  const liveQr = new Set(snap.tables.qr_links.map((r) => r.id));
  const liveAssets = new Set(snap.tables.assets.map((r) => r.id));
  const kept = { qrLinkIds: qrLinkIds.filter((id) => liveQr.has(id)), assetIds: assetIds.filter((id) => liveAssets.has(id)) };
  return { ...kept, omitted: qrLinkIds.length + assetIds.length - kept.qrLinkIds.length - kept.assetIds.length };
}

function readManifest(file, target) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest.schema !== RESET_MANIFEST_SCHEMA) refuse("--manifest is not a Phase E reset manifest");
  if (manifest.organization_id !== NORTHRIDGE) refuse("a reset manifest may only name Northridge");
  if (manifest.target !== target) refuse(`the manifest was built for the ${manifest.target} target, not ${target}`);
  if (manifest.recipe && !IN_LOCK_KINDS.includes(manifest.kind)) refuse("only presenter and refresh manifests are composed in the lock");
  return manifest;
}

function printCounts(plan) {
  for (const [table, c] of Object.entries(plan.counts ?? {})) {
    const changed = c.UPDATE + c.INSERT + c.DELETE > 0 ? "  ←" : "";
    console.log(`  ${table.padEnd(30)} KEEP ${String(c.KEEP).padStart(5)}  UPDATE ${String(c.UPDATE).padStart(4)}  INSERT ${String(c.INSERT).padStart(4)}  DELETE ${String(c.DELETE).padStart(4)}${changed}`);
  }
  for (const r of plan.refusals ?? []) console.log(`  REFUSED [${r.code}] ${r.message}`);
  if (plan.watermark) console.log(`  digest watermark: last success ${plan.watermark.last_success_window_end ?? "none"} · next cutoff ${plan.watermark.next_cutoff} · seeded returns must be at or before ${plan.watermark.effective_start}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// The synthetic showcase dataset (E2B)
// ---------------------------------------------------------------------------------------------------------------------

function loadDataset(file) {
  const resolved = file ? path.resolve(file) : path.join(REPO, DATASET_FILE);
  const bytes = readFileSync(resolved);
  const dataset = JSON.parse(bytes.toString("utf8"));
  if (dataset.organization_id !== NORTHRIDGE) refuse("the dataset is not Northridge's");
  return { file: resolved, dataset, sha: sha256(bytes) };
}

const mediaItems = () => readRepoJson(MEDIA_FILE).items;

/** The presenter / refresh manifest for a live snapshot (inside the apply transaction: the locked rows). */
function composeRecipe(recipe, live) {
  const { dataset, sha } = loadDataset(recipe.dataset_file);
  if (sha !== recipe.dataset_sha256) throw new ResetStop("the dataset file changed since this manifest was written; write a new one");
  let composed;
  try {
    composed = composeDatasetReset({ live, dataset, datasetSha256: sha, removeIds: recipe.remove ?? {}, stage: datasetStage(dataset, mediaItems(), REPO) });
  } catch (err) {
    throw new ResetStop(err.message);
  }
  return buildManifest({
    name: recipe.name,
    kind: recipe.kind,
    target: recipe.target,
    organizationId: recipe.organization_id,
    snapshot: live,
    graph: GRAPH,
    protectedSet: protectedFor(recipe.target, live),
    desired: composed.desired,
    extra: composed.extra,
  });
}

/** The change set of a plan in a comparable form (ids per action, update columns). */
function changeSet(plan) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(plan.changes ?? {}).map(([t, c]) => [t, { insert: [...c.insert].sort(), delete: [...c.delete].sort(), update: c.update.map((u) => `${u.id}:${[...u.columns].sort().join(",")}`).sort() }])
    )
  );
}

function readApprovedPlan(file, manifest) {
  const plan = JSON.parse(readFileSync(file, "utf8"));
  if (plan.name !== manifest.name || plan.kind !== manifest.kind || plan.organization_id !== manifest.organization_id) refuse("--approved-plan is the plan of another manifest");
  if (!plan.ok) refuse("--approved-plan was refused; it cannot approve an apply");
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------------------------------

async function runManifest(args, conn) {
  if (args.org !== NORTHRIDGE) refuse(`--org must be the Northridge organization id exactly (${NORTHRIDGE})`, 2);
  const kinds = ["noop", "draft-e2c", "restore", ...OWNED_KINDS];
  if (!kinds.includes(args.kind)) refuse(`--kind must be one of ${kinds.join(", ")}`, 2);
  if (OWNED_KINDS.includes(args.kind) && args.target === "standalone") refuse("the synthetic dataset is never applied to the standalone archive container");
  const out = outsidePath(args.out, "--out");
  const name = args.name ?? `${args.kind}-${args.target}-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;

  if (IN_LOCK_KINDS.includes(args.kind)) {
    const { file, sha } = loadDataset(args.dataset);
    const remove = args.remove ? JSON.parse(readFileSync(outsidePath(args.remove, "--remove"), "utf8")) : {};
    for (const [table, ids] of Object.entries(remove)) {
      if (!GRAPH.tables[table] || !Array.isArray(ids) || ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))) refuse("--remove must be {\"<table>\": [exact ids]}");
    }
    const recipe = { schema: RESET_MANIFEST_SCHEMA, recipe: true, name, kind: args.kind, target: args.target, organization_id: NORTHRIDGE, graph_sha256: GRAPH.graph_sha256, created_at: new Date().toISOString(), dataset_file: file, dataset_sha256: sha, remove };
    writeJsonFile(out, recipe);
    console.log(`\n${TAG} ${args.target.toUpperCase()} (host: ${conn.host}) — ${args.kind} manifest "${name}" written; it is composed from the live rows at plan time and again inside the apply transaction`);
    console.log(`  removal list: ${Object.entries(remove).map(([t, ids]) => `${t} ${ids.length}`).join(" · ") || "none"}`);
    console.log(`  file: ${out}\n`);
    return;
  }

  const snap = await snapshot(conn, NORTHRIDGE);
  const protectedSet = protectedFor(args.target, snap);
  let desired;
  let extra = {};
  if (args.kind === "noop") desired = noopDesired(snap);
  else if (args.kind === "draft-e2c") desired = draftE2cDesired(snap);
  else if (args.kind === "showcase") {
    const { dataset, sha } = loadDataset(args.dataset);
    const overlay = e2aOverlay(IMPORT_PACKS.map((p) => readRepoJson(`docs/phase-e/packs/${p}/import-manifest.json`)), { apiUrl: conn.apiUrl, repoRoot: REPO, createdAt: dataset.history_start_utc });
    let composed;
    try {
      composed = composeShowcase({ snapshot: snap, dataset, datasetSha256: sha, overlay, stage: datasetStage(dataset, mediaItems(), REPO), options: { removeShowcaseScans: args.scans === "remove-showcase" } });
    } catch (err) {
      refuse(err.message);
    }
    desired = composed.desired;
    extra = composed.extra;
  } else {
    if (!args.archive || !path.isAbsolute(args.archive)) refuse("--kind=restore needs --archive=<absolute package directory>", 2);
    const verified = verifyArchiveDir(args.archive);
    if (!verified.ok) refuse(`the archive failed verification: ${verified.problems.slice(0, 4).join("; ")}`);
    if (verified.manifest.graph.sha256 !== GRAPH.graph_sha256) refuse("the archive was taken under a different schema graph");
    if (verified.manifest.source.organization_id !== NORTHRIDGE) refuse("the archive is not Northridge's");
    const archiveRows = Object.fromEntries(
      Object.keys(verified.manifest.tables).map((t) => [t, JSON.parse(readFileSync(path.join(args.archive, "rows", `${t}.json`), "utf8"))])
    );
    let cutoverInsertIds = {};
    let scanRemovals = [];
    if (args.cutover) {
      const cutover = readManifest(outsidePath(args.cutover, "--cutover"), args.target);
      if (cutover.recipe) refuse("--cutover must be the composed first-application manifest, not a presenter or refresh recipe");
      cutoverInsertIds = Object.fromEntries(
        Object.entries(cutover.desired).map(([t, rows]) => [t, rows.map((r) => r.id).filter((id) => !(id in (cutover.expected[t] ?? {})))])
      );
      scanRemovals = rollbackScanRemovals(cutover, snap);
      if (cutover.owned) {
        // After presenter resets or a refresh the target can hold dataset rows the cutover never inserted (a rebuilt
        // dataset with other keys): the rollback removes every row the current dataset owns or retired as well.
        const { dataset } = loadDataset(args.dataset);
        const owned = ownedIds(dataset);
        const retired = retiredIds(dataset);
        for (const table of DATASET_TABLES) {
          if (table === "scan_events") continue;
          cutoverInsertIds[table] = [...new Set([...(cutoverInsertIds[table] ?? []), ...owned[table], ...retired[table]])];
        }
        const datasetScans = new Set([...owned.scan_events, ...retired.scan_events]);
        scanRemovals = [...new Set([...scanRemovals, ...snap.tables.scan_events.filter((r) => datasetScans.has(r.id)).map((r) => r.id)])].sort();
      }
    }
    desired = restoreDesired({ snapshot: snap, archiveRows, cutoverInsertIds });
    const objects = JSON.parse(readFileSync(path.join(args.archive, "objects.json"), "utf8"));
    extra = {
      ...(scanRemovals.length ? { remove: { scan_events: scanRemovals } } : {}),
      storage: { stage: objects.map((o) => ({ bucket: o.bucket, path: o.path, sha256: o.sha256, mimetype: o.mimetype, cacheControl: o.cacheControl, source: path.join(args.archive, "objects", o.sha256) })) },
    };
    extra.source_archive = { archive_id: verified.manifest.archive_id, manifest_sha256: sha256(readFileSync(path.join(args.archive, "manifest.json"))) };
  }
  const { source_archive: sourceArchive, ...known } = extra;
  const manifest = {
    ...buildManifest({ name, kind: args.kind, target: args.target, organizationId: NORTHRIDGE, snapshot: snap, graph: GRAPH, protectedSet, desired, extra: known }),
    ...(sourceArchive ? { source_archive: sourceArchive } : {}),
  };
  writeJsonFile(out, manifest);
  const rows = Object.entries(desired).map(([t, r]) => `${t} ${r.length}`).join(" · ");
  console.log(`\n${TAG} ${args.target.toUpperCase()} (host: ${conn.host}) — manifest "${name}" (${args.kind}) written`);
  console.log(`  desired rows: ${rows}`);
  if (manifest.owned) console.log(`  dataset: anchor ${manifest.dataset.anchor_local} · appended scans ${manifest.append.scan_events.length} · storage objects to stage ${manifest.storage.stage.length} · E2A applied as ${manifest.e2a.applied_as}`);
  if (manifest.remove) console.log(`  exact removals: ${Object.entries(manifest.remove).map(([t, ids]) => `${t} ${ids.length}`).join(" · ")}`);
  console.log(`  protected: ${protectedSet.qrLinkIds.length} QR rows, ${protectedSet.assetIds.length} assets${protectedSet.omitted ? ` (${protectedSet.omitted} Production-only registry ids absent from this rehearsal target)` : ""}`);
  console.log(`  file: ${out}\n`);
}

async function runPlan(args, conn) {
  const file = outsidePath(args.manifest, "--manifest");
  const read = readManifest(file, args.target);
  const live = await snapshot(conn, read.organization_id);
  const manifest = read.recipe ? composeRecipe(read, live) : read;
  if (read.recipe) writeJsonFile(sibling(file, ".composed.json"), manifest);
  const plan = planReset({ manifest, live, graph: GRAPH, now: new Date() });
  writeJsonFile(sibling(file, ".plan.json"), plan);
  if (plan.ok) writeFileSync(sibling(file, ".sql"), emitResetSql({ plan, manifest, live, graph: GRAPH }).full);
  console.log(`\n${TAG} ${args.target.toUpperCase()} (host: ${conn.host}) — DRY RUN of "${manifest.name}" (${manifest.kind}): ${plan.ok ? "ACCEPTED" : "REFUSED"}`);
  printCounts(plan);
  if (!LOOPBACK.has(args.target)) {
    const summary = { ...planSummary(plan), target: args.target, supabase_ref: conn.ref ?? null, manifest_sha256: sha256(readFileSync(file)) };
    if (manifest.owned) summary.dataset = { scenario_version: manifest.dataset.scenario_version, anchor_utc: manifest.dataset.anchor_utc, appended_scans: manifest.append.scan_events.length, staged_objects: manifest.storage?.stage?.length ?? 0, e2a: manifest.e2a ?? null };
    const serialized = `${JSON.stringify(summary, null, 2)}\n`;
    if (redactionProblems(serialized).length > 0) refuse("the plan summary failed its redaction check; nothing tracked was written");
    mkdirSync(path.join(REPO, "docs/phase-e/archives"), { recursive: true });
    writeFileSync(path.join(REPO, "docs/phase-e/archives", `${manifest.name}.plan.json`), serialized);
    console.log(`  summary written: docs/phase-e/archives/${manifest.name}.plan.json`);
  }
  console.log(`  plan: ${sibling(file, ".plan.json")}${plan.ok ? `\n  sql:  ${sibling(file, ".sql")}` : ""}\n`);
  process.exitCode = plan.ok ? 0 : 1;
}

/** Upload staged objects that are missing (local stack and staging). Never overwrites, never deletes. */
async function stageObjects(apiUrl, serviceRoleKey, stage) {
  const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let present = 0;
  let uploaded = 0;
  for (const object of stage) {
    const existing = await admin.storage.from(object.bucket).download(object.path);
    if (existing.data) {
      if (sha256(Buffer.from(await existing.data.arrayBuffer())) !== object.sha256) throw new ResetStop(`a staged ${object.bucket} object differs from the live one; staging never overwrites`);
      present++;
      continue;
    }
    const bytes = readFileSync(object.source);
    if (sha256(bytes) !== object.sha256) throw new ResetStop("a staged source file does not match its recorded hash");
    const seconds = /max-age=(\d+)/.exec(String(object.cacheControl ?? ""))?.[1] ?? (/^\d+$/.test(String(object.cacheControl ?? "")) ? String(object.cacheControl) : "3600");
    const { error } = await admin.storage.from(object.bucket).upload(object.path, bytes, { contentType: object.mimetype ?? "application/octet-stream", cacheControl: seconds, upsert: false });
    if (error) throw new ResetStop(`could not stage one ${object.bucket} object (${error.message}); nothing relational was changed`);
    const back = await admin.storage.from(object.bucket).download(object.path);
    if (back.error || sha256(Buffer.from(await back.data.arrayBuffer())) !== object.sha256) throw new ResetStop("a staged object did not read back with its hash");
    uploaded++;
  }
  return { present, uploaded };
}

async function runApply(args, conn, read, approved) {
  const file = outsidePath(args.manifest, "--manifest");
  const org = read.organization_id;
  const client = conn.client;
  let plan;
  let sql;
  let manifest = read.recipe ? null : read;
  // Objects first (only missing ones): rows that point at them are written afterwards.
  const preStage = read.recipe ? null : (manifest.storage?.stage ?? []);
  const canStage = args.target === "local" || args.target === "staging";
  let staged = preStage && canStage && preStage.length > 0 ? await stageObjects(conn.apiUrl, conn.serviceRoleKey, preStage) : { present: 0, uploaded: 0, verifiedFromPackage: preStage?.length ?? 0 };
  if (read.recipe) {
    const { dataset } = loadDataset(read.dataset_file);
    staged = await stageObjects(conn.apiUrl, conn.serviceRoleKey, datasetStage(dataset, mediaItems(), REPO));
  }

  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '120s'");
    await client.query("set local timezone = 'UTC'");
    await client.query("select id from public.organizations where id = $1 for update", [org]);
    const t0 = new Date().toISOString();
    const tables = await pgTables(client, GRAPH, org, t0, { lock: true });
    const { identity } = await pgIdentity(client, GRAPH, tables);
    const live = { taken_at: t0, tables, identity };
    if (read.recipe) manifest = composeRecipe(read, live);
    plan = planReset({ manifest, live, graph: GRAPH, now: new Date() });
    if (!plan.ok) throw new ResetStop(`the plan was refused on the locked rows: ${plan.refusals.slice(0, 4).map((r) => r.message).join("; ")}`);
    if (approved && changeSet(approved) !== changeSet(plan)) throw new ResetStop("the change set on the locked rows differs from --approved-plan; re-plan and review again");
    sql = emitResetSql({ plan, manifest, live, graph: GRAPH });
    await client.query(sql.prelude.replace(/^begin;\n/, ""));
    if (sql.writes) await client.query(sql.writes);
    if (args.failAt === "writes") throw new ResetStop("--fail-at=writes: aborting after the writes to prove the rollback");
    await client.query(sql.postchecks);
    if (args.failAt === "postchecks") throw new ResetStop("--fail-at=postchecks: aborting after the post-checks to prove the rollback");
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    if (plan) printCounts(plan);
    throw err;
  }

  if (read.recipe) writeJsonFile(sibling(file, ".composed.json"), manifest);
  const after = planReset({ manifest, live: await snapshot(conn, org), graph: GRAPH, now: new Date() });
  const converged = after.ok && Object.values(after.counts).every((c) => c.UPDATE + c.INSERT + c.DELETE === 0);
  const report = { manifest: manifest.name, kind: manifest.kind, target: args.target, applied_at: new Date().toISOString(), statements: sql.statements, counts: plan.counts, staged, converged, staging_proof: conn.proof ?? null };
  writeJsonFile(sibling(file, ".apply.json"), report);
  console.log(`\n${TAG} ${args.target.toUpperCase()} (host: ${conn.host}) — APPLIED "${manifest.name}" (${manifest.kind}) in one transaction: ${sql.statements} guarded statements`);
  printCounts(plan);
  console.log(`  storage staged: ${JSON.stringify(staged)}`);
  console.log(`  re-plan after commit: ${converged ? "CONVERGED (all KEEP)" : "NOT CONVERGED"}\n`);
  process.exitCode = converged ? 0 : 1;
}

const args = parseArgs(process.argv.slice(2));
if (args.command === "apply" && args.target === "production") refuse("Production never takes an apply from this tool (E2C runs its own approved cutover); plan it instead");
let read = null;
let approved = null;
if (args.command === "apply") {
  read = readManifest(outsidePath(args.manifest, "--manifest"), args.target);
  if (args.target === "staging" && !OWNED_KINDS.includes(read.kind)) refuse("on staging only the synthetic dataset kinds (showcase, presenter, refresh) are applied");
  if (args.target === "staging" && !args.approvedPlan) refuse("a staging apply needs --approved-plan=<the reviewed dry-run plan file>");
  if (args.approvedPlan) approved = readApprovedPlan(outsidePath(args.approvedPlan, "--approved-plan"), read);
}
let conn = null;
try {
  conn = await connect(args.target, { forApply: args.command === "apply" });
  if (args.command === "manifest") await runManifest(args, conn);
  else if (args.command === "plan") await runPlan(args, conn);
  else await runApply(args, conn, read, approved);
} catch (err) {
  const message = String(err?.message ?? err).split("\n")[0].slice(0, 400);
  console.error(`\n${TAG} ${err instanceof ResetStop ? "STOPPED" : "FAILED"}: ${message}\n`);
  process.exitCode = 1;
} finally {
  if (conn?.kind === "pg") await conn.client.end().catch(() => {});
}
