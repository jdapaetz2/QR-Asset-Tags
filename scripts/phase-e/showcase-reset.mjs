#!/usr/bin/env node
/**
 * Engineering Phase E1 — the guarded showcase reset interface. Dry runs on any target; applies only on loopback targets.
 *
 *   npm.cmd run phase-e:reset:production -- manifest --kind=noop|draft-e2c --org=<Northridge id> --out=<abs file>
 *   npm.cmd run phase-e:reset:production -- plan --manifest=<abs file>
 *   npm.cmd run phase-e:reset:staging -- manifest|plan …
 *   npm.cmd run phase-e:reset:local -- manifest|plan|apply …        the repo's local stack (synthetic data)
 *   npm.cmd run phase-e:reset:standalone -- manifest|plan|apply …   the loopback-only restore container
 *   … manifest --kind=restore --archive=<abs package dir> [--cutover=<abs cutover manifest>]
 *   … apply --manifest=<abs file> [--fail-at=writes|postchecks]
 *
 * ONE ORGANIZATION: Northridge, by exact id (no wildcard, no other tenant, no public endpoint). Hosted targets (staging,
 * Production) are read through the service role's PostgREST with a read-only client, after their live schema is matched
 * against the tracked dependency graph; they never get an apply — E1 does not reset a hosted project.
 *
 * APPLY (loopback only) is one transaction with triggers ON: lock the organization row (new rows that reference it wait;
 * other tenants are unaffected) and its rows, plan on the locked rows, run the emitted guards, writes and post-checks,
 * commit — or roll back on any refusal or failure. Staged Storage objects are uploaded first and never deleted. A fresh
 * re-plan afterwards must be all KEEP (convergence).
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
import { redactionProblems } from "../lib/showcase-inventory.mjs";
import {
  RESET_MANIFEST_SCHEMA,
  buildManifest,
  draftE2cDesired,
  emitResetSql,
  noopDesired,
  planReset,
  planSummary,
  restoreDesired,
} from "../lib/showcase-reset.mjs";
import { compareWithOpenApi, openApiTables } from "../lib/tenant-graph.mjs";
import { fetchOpenApi, pgIdentity, pgTables, postgrestIdentity, postgrestTables, readOnlyClient } from "../lib/tenant-snapshot.mjs";

const TAG = "[reset]";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GRAPH = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/manifests/tenant-dependency-graph.json"), "utf8"));
const PROTECTED = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/manifests/protected-demo-routes.json"), "utf8"));
const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";
const KNOWN_STAGING_REF = "kwserenxwjxozztyigmw";
const TARGETS = ["local", "standalone", "staging", "production"];
const LOOPBACK = new Set(["local", "standalone"]);
const COMMANDS = ["manifest", "plan", "apply"];

class ResetStop extends Error {}

function refuse(message, code = 1) {
  console.error(`\n${TAG} REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { target: null, command: null, kind: null, org: null, out: null, manifest: null, archive: null, cutover: null, name: null, failAt: null };
  for (const raw of argv) {
    if (COMMANDS.includes(raw)) {
      if (args.command) refuse("give one command", 2);
      args.command = raw;
      continue;
    }
    const m = /^--(target|kind|org|out|manifest|archive|cutover|name|fail-at)=(.+)$/.exec(raw);
    if (!m) refuse(`unknown argument ${JSON.stringify(String(raw).split("=")[0].slice(0, 40))}`, 2);
    const key = m[1] === "fail-at" ? "failAt" : m[1];
    if (args[key] !== null) refuse(`--${m[1]} was given twice`, 2);
    args[key] = m[2].trim();
  }
  if (!TARGETS.includes(args.target)) refuse(`--target must be one of ${TARGETS.join(", ")}`, 2);
  if (!args.command) refuse(`a command is required: ${COMMANDS.join(", ")}`, 2);
  if (args.failAt && !["writes", "postchecks"].includes(args.failAt)) refuse("--fail-at must be writes or postchecks", 2);
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

// ---------------------------------------------------------------------------------------------------------------------
// Targets and snapshots
// ---------------------------------------------------------------------------------------------------------------------

async function connect(target) {
  if (target === "local") {
    const status = readLocalStackStatus(REPO);
    const client = new pg.Client({ connectionString: status.dbUrl });
    await client.connect();
    await client.query("set timezone = 'UTC'");
    return { kind: "pg", client, status, host: new URL(status.dbUrl).hostname };
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) refuse("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (never printed).");
  let resolved;
  try {
    resolved = assertTarget(target, { supabaseUrl, expectedStagingRef: KNOWN_STAGING_REF });
  } catch (err) {
    refuse(err.message);
  }
  const schemaProblems = compareWithOpenApi(GRAPH, openApiTables(await fetchOpenApi(supabaseUrl, serviceRoleKey)));
  if (schemaProblems.length > 0) refuse(`the target's schema does not match the dependency graph: ${schemaProblems.slice(0, 8).join("; ")}`);
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { kind: "postgrest", client: readOnlyClient(db), host: resolved.host, ref: resolved.ref };
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
// Commands
// ---------------------------------------------------------------------------------------------------------------------

async function runManifest(args, conn) {
  if (args.org !== NORTHRIDGE) refuse(`--org must be the Northridge organization id exactly (${NORTHRIDGE})`, 2);
  if (!["noop", "draft-e2c", "restore"].includes(args.kind)) refuse("--kind must be noop, draft-e2c or restore", 2);
  const out = outsidePath(args.out, "--out");
  const snap = await snapshot(conn, NORTHRIDGE);
  const protectedSet = protectedFor(args.target, snap);
  let desired;
  let extra = {};
  if (args.kind === "noop") desired = noopDesired(snap);
  else if (args.kind === "draft-e2c") desired = draftE2cDesired(snap);
  else {
    if (!args.archive || !path.isAbsolute(args.archive)) refuse("--kind=restore needs --archive=<absolute package directory>", 2);
    const verified = verifyArchiveDir(args.archive);
    if (!verified.ok) refuse(`the archive failed verification: ${verified.problems.slice(0, 4).join("; ")}`);
    if (verified.manifest.graph.sha256 !== GRAPH.graph_sha256) refuse("the archive was taken under a different schema graph");
    if (verified.manifest.source.organization_id !== NORTHRIDGE) refuse("the archive is not Northridge's");
    const archiveRows = Object.fromEntries(
      Object.keys(verified.manifest.tables).map((t) => [t, JSON.parse(readFileSync(path.join(args.archive, "rows", `${t}.json`), "utf8"))])
    );
    let cutoverInsertIds = {};
    if (args.cutover) {
      const cutover = readManifest(outsidePath(args.cutover, "--cutover"), args.target);
      cutoverInsertIds = Object.fromEntries(
        Object.entries(cutover.desired).map(([t, rows]) => [t, rows.map((r) => r.id).filter((id) => !(id in (cutover.expected[t] ?? {})))])
      );
    }
    desired = restoreDesired({ snapshot: snap, archiveRows, cutoverInsertIds });
    const objects = JSON.parse(readFileSync(path.join(args.archive, "objects.json"), "utf8"));
    extra = {
      source_archive: { archive_id: verified.manifest.archive_id, manifest_sha256: sha256(readFileSync(path.join(args.archive, "manifest.json"))) },
      storage: { stage: objects.map((o) => ({ bucket: o.bucket, path: o.path, sha256: o.sha256, mimetype: o.mimetype, cacheControl: o.cacheControl, source: path.join(args.archive, "objects", o.sha256) })) },
    };
  }
  const name = args.name ?? `${args.kind}-${args.target}-${snap.taken_at.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
  const manifest = { ...buildManifest({ name, kind: args.kind, target: args.target, organizationId: NORTHRIDGE, snapshot: snap, graph: GRAPH, protectedSet, desired }), ...extra };
  writeJsonFile(out, manifest);
  const rows = Object.entries(desired).map(([t, r]) => `${t} ${r.length}`).join(" · ");
  console.log(`\n${TAG} ${args.target.toUpperCase()} (host: ${conn.host}) — manifest "${name}" (${args.kind}) written`);
  console.log(`  desired rows: ${rows}`);
  console.log(`  protected: ${protectedSet.qrLinkIds.length} QR rows, ${protectedSet.assetIds.length} assets${protectedSet.omitted ? ` (${protectedSet.omitted} Production-only registry ids absent from this rehearsal target)` : ""}`);
  console.log(`  file: ${out}\n`);
}

async function runPlan(args, conn) {
  const file = outsidePath(args.manifest, "--manifest");
  const manifest = readManifest(file, args.target);
  const live = await snapshot(conn, manifest.organization_id);
  const plan = planReset({ manifest, live, graph: GRAPH, now: new Date() });
  writeJsonFile(sibling(file, ".plan.json"), plan);
  if (plan.ok) writeFileSync(sibling(file, ".sql"), emitResetSql({ plan, manifest, live, graph: GRAPH }).full);
  console.log(`\n${TAG} ${args.target.toUpperCase()} (host: ${conn.host}) — DRY RUN of "${manifest.name}" (${manifest.kind}): ${plan.ok ? "ACCEPTED" : "REFUSED"}`);
  printCounts(plan);
  if (!LOOPBACK.has(args.target)) {
    const summary = { ...planSummary(plan), target: args.target, supabase_ref: conn.ref ?? null, manifest_sha256: sha256(readFileSync(file)) };
    const serialized = `${JSON.stringify(summary, null, 2)}\n`;
    if (redactionProblems(serialized).length > 0) refuse("the plan summary failed its redaction check; nothing tracked was written");
    mkdirSync(path.join(REPO, "docs/phase-e/archives"), { recursive: true });
    writeFileSync(path.join(REPO, "docs/phase-e/archives", `${manifest.name}.plan.json`), serialized);
    console.log(`  summary written: docs/phase-e/archives/${manifest.name}.plan.json`);
  }
  console.log(`  plan: ${sibling(file, ".plan.json")}${plan.ok ? `\n  sql:  ${sibling(file, ".sql")}` : ""}\n`);
  process.exitCode = plan.ok ? 0 : 1;
}

/** Upload staged objects that are missing (local stack only). Never overwrites, never deletes. */
async function stageObjects(status, stage) {
  const admin = createClient(status.apiUrl, status.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
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
    const seconds = /max-age=(\d+)/.exec(String(object.cacheControl ?? ""))?.[1] ?? "3600";
    const { error } = await admin.storage.from(object.bucket).upload(object.path, bytes, { contentType: object.mimetype ?? "application/octet-stream", cacheControl: seconds, upsert: false });
    if (error) throw new ResetStop(`could not stage one ${object.bucket} object (${error.message}); nothing relational was changed`);
    const back = await admin.storage.from(object.bucket).download(object.path);
    if (back.error || sha256(Buffer.from(await back.data.arrayBuffer())) !== object.sha256) throw new ResetStop("a staged object did not read back with its hash");
    uploaded++;
  }
  return { present, uploaded };
}

async function runApply(args, conn) {
  if (!LOOPBACK.has(args.target)) refuse("E1 applies a reset only on a loopback target (the local stack or the standalone container); hosted targets get dry runs only");
  const file = outsidePath(args.manifest, "--manifest");
  const manifest = readManifest(file, args.target);
  const org = manifest.organization_id;
  const stage = manifest.storage?.stage ?? [];
  const staged = args.target === "local" && stage.length > 0 ? await stageObjects(conn.status, stage) : { present: 0, uploaded: 0, verifiedFromPackage: stage.length };

  const client = conn.client;
  let plan;
  let sql;
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
    plan = planReset({ manifest, live, graph: GRAPH, now: new Date() });
    if (!plan.ok) throw new ResetStop(`the plan was refused on the locked rows: ${plan.refusals.slice(0, 4).map((r) => r.message).join("; ")}`);
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

  const after = planReset({ manifest, live: await snapshot(conn, org), graph: GRAPH, now: new Date() });
  const converged = after.ok && Object.values(after.counts).every((c) => c.UPDATE + c.INSERT + c.DELETE === 0);
  const report = { manifest: manifest.name, kind: manifest.kind, target: args.target, applied_at: new Date().toISOString(), statements: sql.statements, counts: plan.counts, staged, converged };
  writeJsonFile(sibling(file, ".apply.json"), report);
  console.log(`\n${TAG} ${args.target.toUpperCase()} (host: ${conn.host}) — APPLIED "${manifest.name}" (${manifest.kind}) in one transaction: ${sql.statements} guarded statements`);
  printCounts(plan);
  console.log(`  storage staged: ${JSON.stringify(staged)}`);
  console.log(`  re-plan after commit: ${converged ? "CONVERGED (all KEEP)" : "NOT CONVERGED"}\n`);
  process.exitCode = converged ? 0 : 1;
}

const args = parseArgs(process.argv.slice(2));
if (args.command === "apply" && !LOOPBACK.has(args.target)) {
  refuse("E1 applies a reset only on a loopback target (the local stack or the standalone container); hosted targets get dry runs only");
}
let conn = null;
try {
  conn = await connect(args.target);
  if (args.command === "manifest") await runManifest(args, conn);
  else if (args.command === "plan") await runPlan(args, conn);
  else await runApply(args, conn);
} catch (err) {
  const message = String(err?.message ?? err).split("\n")[0].slice(0, 400);
  console.error(`\n${TAG} ${err instanceof ResetStop ? "STOPPED" : "FAILED"}: ${message}\n`);
  process.exitCode = 1;
} finally {
  if (conn?.kind === "pg") await conn.client.end().catch(() => {});
}
