#!/usr/bin/env node
/**
 * Engineering Phase E1 — export a recovery package for one fixture organization, or verify one offline.
 *
 *   npm.cmd run phase-e:archive:production -- --org=<fixture id> [--root=<absolute dir>]
 *   npm.cmd run phase-e:archive:staging -- --org=<fixture id> [--root=<absolute dir>]
 *   node scripts/phase-e/showcase-archive.mjs --target=local --org=<local fixture id> --root=<absolute dir>
 *   npm.cmd run phase-e:archive:verify -- --path=<absolute package dir>
 *
 * `--target=local` exports from the repo's local stack (URL and key from `supabase status`, both loopback-checked) for
 * the synthetic rehearsal in tests/phase-e-local; it needs an explicit --root and writes no tracked summary.
 *
 * READ-ONLY ON THE SOURCE. The database client is wrapped (scripts/lib/tenant-snapshot.mjs) so only SELECTs, Storage
 * listings and Storage downloads exist; a unit test scans both files for anything else. The package is written OUTSIDE the repository and outside every
 * OneDrive folder (default: <home>\Mulemark-Ops-Archive), as <id>.partial, renamed only once SHA256SUMS and manifest.json
 * exist. Only a redacted summary (counts, check results, the manifest hash) is written into the repository.
 *
 * BEFORE READING: the target is verified (scripts/lib/env-target.mjs), the organization must be a fixture of that
 * target, exports refuse the 13:00–15:00 UTC digest slots, and the target's live PostgREST schema must match the tracked
 * dependency graph both ways. COHERENCE: every non-scan table is read again at the end and compared; scans after the
 * start time T0 are excluded. Any change, unknown Storage path, cross-tenant reference or unknown table stops the run.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (never printed).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";
import { readLocalStackStatus } from "../lib/local-stack.mjs";
import {
  ARCHIVE_SCHEMA,
  archiveId,
  archiveRootProblems,
  buildSums,
  coherenceProblems,
  digestWindowProblem,
  redactedSummary,
  referenceProblems,
  rowHash,
  scanStorageReferences,
  sha256,
  tableHash,
  verifyArchiveDir,
  writeJson,
  writeObject,
} from "../lib/showcase-archive.mjs";
import { FIXTURE_ORGS, auditRefusal, classifyStorageObject, redactionProblems } from "../lib/showcase-inventory.mjs";
import { compareWithOpenApi, openApiTables } from "../lib/tenant-graph.mjs";
import { PAGE, fetchOpenApi, postgrestIdentity, postgrestTables, readOnlyClient } from "../lib/tenant-snapshot.mjs";

const TAG = "[archive]";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GRAPH = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/manifests/tenant-dependency-graph.json"), "utf8"));
const PROTECTED = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/manifests/protected-demo-routes.json"), "utf8"));
/** Public, not a secret (scripts/production/lib/qa-forms.mjs). */
const KNOWN_STAGING_REF = "kwserenxwjxozztyigmw";
/** Local stack only: the synthetic rehearsal fixture is built on the seed's Northridge id (tests/phase-e-local). */
const LOCAL_FIXTURE_ORGS = Object.freeze({ "11111111-1111-4111-8111-111111111111": "northridge-synthetic" });
const MAX_OBJECTS = 20_000;
const MAX_DEPTH = 8;
const BUCKETS = ["submissions", "documents", "public-assets"];

function refuse(message, code = 1) {
  console.error(`\n${TAG} REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const [first, ...rest] = argv;
  const mode = first === "verify" ? "verify" : "export";
  const args = { mode, target: null, org: null, root: null, path: null };
  for (const raw of mode === "verify" ? rest : argv) {
    const m = /^--(target|org|root|path)=(.+)$/.exec(raw);
    if (!m) refuse(`unknown argument ${JSON.stringify(String(raw).split("=")[0].slice(0, 40))}`, 2);
    if (args[m[1]] !== null) refuse(`--${m[1]} was given twice`, 2);
    args[m[1]] = m[2].trim();
  }
  return args;
}

// ---------------------------------------------------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------------------------------------------------

function runVerify(args) {
  if (!args.path || !path.isAbsolute(args.path)) refuse("--path=<absolute package directory> is required", 2);
  const result = verifyArchiveDir(args.path);
  const manifestSha = existsSync(path.join(args.path, "manifest.json")) ? sha256(readFileSync(path.join(args.path, "manifest.json"))) : null;
  console.log(`\n${TAG} verify ${path.basename(args.path)} — ${result.ok ? "OK" : "FAILED"}${manifestSha ? ` (manifest ${manifestSha.slice(0, 16)}…)` : ""}`);
  for (const problem of result.problems) console.log(`  - ${problem}`);
  process.exitCode = result.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------------------------------------------------

/** Every scoped table's rows through the read-only client; scan_events up to T0 only. */
const exportTables = (client, orgId, t0) => postgrestTables(client, GRAPH, orgId, t0);

async function listObjects(client, orgId) {
  const objects = [];
  for (const bucket of BUCKETS) {
    const pending = [{ prefix: `org/${orgId}`, depth: 0 }];
    while (pending.length > 0) {
      const { prefix, depth } = pending.pop();
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await client.list(bucket, prefix, offset);
        if (error) throw new Error(`could not list the ${bucket} bucket`);
        for (const entry of data ?? []) {
          const objectPath = `${prefix}/${entry.name}`;
          if (entry.id === null || entry.id === undefined) {
            if (depth + 1 > MAX_DEPTH) throw new Error(`the ${bucket} bucket is nested deeper than expected`);
            pending.push({ prefix: objectPath, depth: depth + 1 });
          } else {
            objects.push({
              bucket,
              path: objectPath,
              size: entry.metadata?.size ?? null,
              mimetype: entry.metadata?.mimetype ?? null,
              cacheControl: entry.metadata?.cacheControl ?? null,
              eTag: entry.metadata?.eTag ?? null,
              created_at: entry.created_at ?? null,
              updated_at: entry.updated_at ?? null,
              last_accessed_at: entry.last_accessed_at ?? null,
            });
            if (objects.length > MAX_OBJECTS) throw new Error("more Storage objects than this tool exports");
          }
        }
        if ((data ?? []).length < PAGE) break;
      }
    }
  }
  return objects;
}

async function downloadWithRetry(client, bucket, objectPath) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await client.download(bucket, objectPath);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
    lastError = error;
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw new Error(`could not download one ${bucket} object after 3 attempts (${String(lastError?.message ?? lastError).slice(0, 80)})`);
}

function renameWithRetry(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (err) {
      if (attempt >= 6) throw err;
      const wait = Date.now() + 500;
      while (Date.now() < wait) {
        /* antivirus can hold a just-written file briefly on Windows */
      }
    }
  }
}

async function runExport(args) {
  if (!args.target || !args.org) refuse("--target and --org are required", 2);
  const mode = args.target.toLowerCase();
  const orgId = args.org.toLowerCase();
  const local = mode === "local";
  let fixture;
  if (local) {
    fixture = LOCAL_FIXTURE_ORGS[orgId];
    if (!fixture) refuse(`--org is not an allowlisted local fixture organization. Allowed: ${Object.keys(LOCAL_FIXTURE_ORGS).join(", ")}`);
    if (!args.root) refuse("--target=local needs an explicit --root (synthetic packages never share the operator's archive folder)", 2);
  } else {
    const refusal = auditRefusal({ target: mode, org: orgId });
    if (refusal) refuse(refusal);
    fixture = FIXTURE_ORGS[mode][orgId];
    const windowProblem = digestWindowProblem();
    if (windowProblem) refuse(windowProblem);
  }

  const root = args.root ?? path.join(homedir(), "Mulemark-Ops-Archive");
  const rootProblems = archiveRootProblems(root, { repoRoot: REPO });
  if (rootProblems.length > 0) refuse(rootProblems.join("; "));

  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (local) {
    try {
      ({ apiUrl: supabaseUrl, serviceRoleKey } = readLocalStackStatus(REPO));
    } catch (err) {
      refuse(String(err?.message ?? err).split("\n")[0]);
    }
  }
  if (!supabaseUrl || !serviceRoleKey) refuse("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (never printed).");
  let target;
  try {
    target = assertTarget(mode, { supabaseUrl, expectedStagingRef: KNOWN_STAGING_REF });
  } catch (err) {
    refuse(err.message);
  }

  // The tracked graph must be internally consistent before it is trusted.
  const { graph_sha256: graphSha, ...graphBody } = GRAPH;
  if (sha256(JSON.stringify(graphBody)) !== graphSha) refuse("docs/phase-e/manifests/tenant-dependency-graph.json does not match its own graph_sha256");

  console.log(`\n${TAG} ${mode.toUpperCase()} (host: ${target.host}) — read-only export of ${orgId.slice(0, 8)} (${fixture})`);
  const schemaProblems = compareWithOpenApi(GRAPH, openApiTables(await fetchOpenApi(supabaseUrl, serviceRoleKey)));
  if (schemaProblems.length > 0) refuse(`the target's schema does not match the dependency graph: ${schemaProblems.slice(0, 8).join("; ")}`);
  console.log(`${TAG} schema matches the dependency graph (${Object.keys(GRAPH.tables).length} tables, both ways)`);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const client = readOnlyClient(db);
  const t0 = new Date().toISOString();
  const tables = await exportTables(client, orgId, t0);
  if ((tables.organizations ?? []).length !== 1) refuse(`organization ${orgId} does not exist on this project`);

  // Identity references: profiles outside the tenant that its rows point at. A reference into another tenant blocks.
  const { ids: externalIds, identity } = await postgrestIdentity(client, GRAPH, tables);
  if (identity.length !== externalIds.length) refuse("a referenced profile no longer exists");
  if (identity.some((p) => p.organization_id && p.organization_id !== orgId)) {
    refuse("the tenant's rows reference a profile in ANOTHER organization; restoring it would need that organization (operator decision)");
  }

  // Storage: every object under org/<id>/, every reference in every row, and their joins.
  const references = Object.entries(tables).flatMap(([table, rows]) => scanStorageReferences(table, rows));
  const refProblems = referenceProblems(references, { organizationId: orgId, projectHost: target.host });
  if (refProblems.length > 0) refuse(refProblems.join("; "));
  const objects = await listObjects(client, orgId);
  // Every object must follow a managed grammar (submission, document, cover, logo); anything else is unrecognised.
  const unknown = objects.filter((o) => classifyStorageObject(o.path, orgId).kind === "other");
  if (unknown.length > 0) refuse(`${unknown.length} Storage object(s) under the organization prefix follow no known path grammar`);

  const id = archiveId({ fixture, target: mode });
  const finalDir = path.join(root, id);
  const partialDir = `${finalDir}.partial`;
  if (existsSync(finalDir) || existsSync(partialDir)) refuse(`a package named ${id} already exists in the archive root`);
  mkdirSync(partialDir, { recursive: true });

  const listed = new Set(objects.map((o) => `${o.bucket}/${o.path}`));
  let bytes = 0;
  const byBucket = {};
  const objectRecords = [];
  for (const object of objects) {
    const content = await downloadWithRetry(client, object.bucket, object.path);
    const hash = writeObject(partialDir, content);
    const etag = String(object.eTag ?? "").replace(/"/g, "");
    const md5 = createHash("md5").update(content).digest("hex");
    objectRecords.push({ ...object, sha256: hash, size: content.length, etag_md5_match: /^[0-9a-f]{32}$/.test(etag) ? etag === md5 : null });
    bytes += content.length;
    const b = (byBucket[object.bucket] ??= { objects: 0, bytes: 0 });
    b.objects++;
    b.bytes += content.length;
  }
  if (objectRecords.some((o) => o.etag_md5_match === false)) refuse("a downloaded object does not match its Storage eTag");
  const referenceRecords = references.map((ref) => ({
    ...ref,
    status: ref.bucket && listed.has(`${ref.bucket}/${ref.path}`) ? "present" : "missing",
  }));

  // Coherence: read every non-scan table again and compare with the first read.
  const again = await exportTables(client, orgId, t0);
  const coherence = coherenceProblems(tables, again);
  if (coherence.length > 0) {
    writeFileSync(path.join(partialDir, "INCOHERENT"), `${coherence.join("\n")}\n`);
    refuse(`concurrent writes during the export (${coherence.join("; ")}); the partial package was left unfinished — re-run`);
  }
  const t1 = new Date().toISOString();

  for (const [table, rows] of Object.entries(tables)) writeJson(partialDir, `rows/${table}.json`, rows);
  writeJson(partialDir, "identity.json", identity);
  writeJson(partialDir, "objects.json", objectRecords);
  writeJson(partialDir, "references.json", referenceRecords);
  const protectedQr = new Set([...PROTECTED.routes.map((r) => r.qr_link_id), ...PROTECTED.other_northridge_qr_rows.map((r) => r.qr_link_id)]);
  const routes = (tables.qr_links ?? []).map((q) => ({
    short_code: q.short_code,
    qr_link_id: q.id,
    asset_id: q.asset_id,
    status: q.status,
    is_production_primary: q.is_production_primary,
    supersedes_qr_link_id: q.supersedes_qr_link_id,
    protected: protectedQr.has(q.id),
    row_sha256: rowHash(q),
  }));
  writeJson(partialDir, "routes.json", routes);

  const sums = buildSums(partialDir);
  writeFileSync(path.join(partialDir, "SHA256SUMS"), sums);
  const missing = referenceRecords.filter((r) => r.status === "missing");
  const manifest = {
    schema: ARCHIVE_SCHEMA,
    archive_id: id,
    status: "complete",
    created_at: t1,
    tool: "scripts/phase-e/showcase-archive.mjs",
    source: { target: mode, supabase_ref: target.ref, host: target.host, organization_id: orgId, fixture },
    graph: { sha256: graphSha, migrations: GRAPH.migrations.length },
    window: { t0, t1, scans_after_t0_excluded: true },
    tables: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, { rows: rows.length, table_hash: tableHash(rows) }])),
    objects: { count: objectRecords.length, unique_bytes_files: new Set(objectRecords.map((o) => o.sha256)).size, bytes, by_bucket: byBucket },
    references: { total: referenceRecords.length, present: referenceRecords.length - missing.length, missing: missing.length },
    missing_references: missing.map((r) => ({ table: r.table, id: r.id, column: r.column, pointer: r.pointer, bucket: r.bucket, path: r.path })),
    identity: { profiles_in_tenant: (tables.profiles ?? []).length, external_profiles: identity.length },
    protected: {
      routes: routes.filter((r) => r.protected).length,
      qr_link_ids: routes.filter((r) => r.protected).map((r) => r.qr_link_id),
      asset_ids: PROTECTED.routes.map((r) => r.asset_id).filter((a) => (tables.assets ?? []).some((x) => x.id === a)),
    },
    checks: { schema_matches_graph: true, coherent: true, references_in_tenant: true, storage_paths_known: true, etags_match: true },
    custody: {
      owner: "operator",
      location: "local Windows profile folder outside the repository and outside OneDrive (path not recorded in Git)",
      retention: "until Phase E closeout (E5C) plus the operator's explicit retention decision; never auto-deleted",
      second_copy: "a verified copy on separate media is required before any E2C approval",
      restore_rule: "loopback-only targets; a real archive only into the standalone 127.0.0.1-bound container",
    },
    data_files_sha256: sha256(sums),
  };
  writeFileSync(path.join(partialDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  renameWithRetry(partialDir, finalDir);

  const verified = verifyArchiveDir(finalDir);
  if (!verified.ok) refuse(`the written package failed verification: ${verified.problems.join("; ")}`);
  const manifestSha = sha256(readFileSync(path.join(finalDir, "manifest.json")));

  const summary = redactedSummary(manifest, manifestSha);
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  const leaks = redactionProblems(serialized);
  if (leaks.length > 0) refuse(`the redacted summary failed its check (${leaks.join(", ")}); the package exists but no summary was written`);
  if (!local) {
    mkdirSync(path.join(REPO, "docs/phase-e/archives"), { recursive: true });
    writeFileSync(path.join(REPO, "docs/phase-e/archives", `${id}.json`), serialized);
  }

  const counts = Object.entries(manifest.tables).map(([t, info]) => `${t} ${info.rows}`).join(" · ");
  console.log(`${TAG} rows: ${counts}`);
  console.log(`${TAG} objects: ${manifest.objects.count} (${bytes} bytes) · references ${manifest.references.total} (${manifest.references.missing} missing) · external profiles ${identity.length}`);
  console.log(`${TAG} package ${id} verified — manifest ${manifestSha}`);
  console.log(`${TAG} package path: ${finalDir}`);
  console.log(local ? `${TAG} local synthetic package: no tracked summary\n` : `${TAG} summary written: docs/phase-e/archives/${id}.json\n`);
}

const args = parseArgs(process.argv.slice(2));
try {
  if (args.mode === "verify") runVerify(args);
  else await runExport(args);
} catch (err) {
  console.error(`\n${TAG} stopped: ${String(err?.message ?? err).split("\n")[0].slice(0, 240)}\n`);
  process.exitCode = 1;
}
