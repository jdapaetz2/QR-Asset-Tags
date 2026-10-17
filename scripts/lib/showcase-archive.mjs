/**
 * Engineering Phase E1 — the recovery-package format and the checks every producer and consumer runs.
 *
 * The decisions are pure. The only I/O here works on a LOCAL archive directory the caller names (writing the files of
 * a package, and re-hashing them for `verify`); nothing in this module talks to a database or the network.
 *
 * LAYOUT (docs/phase-e/DEMO_RECOVERY_RUNBOOK.md):
 *   <root>/<archive id>/
 *     manifest.json      what the package is, where it came from, counts, check results, data_files_sha256
 *     SHA256SUMS         "<sha256>  <relative path>" for every data file (not manifest.json, not itself)
 *     rows/<table>.json  the tenant's rows, exactly as PostgREST returned them, sorted by id
 *     identity.json      profiles referenced from outside the tenant (id, auth_user_id, role, organization_id, status)
 *     objects/<sha256>   original Storage bytes, named by content hash (no Windows path or case problems)
 *     objects.json       per object: bucket, path, sha256, size, mimetype, cacheControl, eTag, timestamps
 *     references.json    every Storage reference found in the rows, with present / missing status
 *     routes.json        protected route mappings at export time
 * A package is written as `<id>.partial` and renamed only after SHA256SUMS and manifest.json exist.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ARCHIVE_SCHEMA = "mulemark.phase-e.recovery-archive/v1";

// ---------------------------------------------------------------------------------------------------------------------
// Canonical hashing
// ---------------------------------------------------------------------------------------------------------------------

/** JSON with object keys sorted at every depth, so two equal rows always serialize identically. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const rowHash = (row) => sha256(canonicalJson(row));

/** Rows sorted by id, the way every package stores them. */
export const sortRows = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));

/** One hash over a table's rows (order-independent: sorted per-row hashes). */
export function tableHash(rows) {
  return sha256(rows.map(rowHash).sort().join("\n"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Archive root
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Why an archive root is not acceptable, or [] when it is. The root must be absolute, outside the repository, outside
 * every OneDrive folder (on this machine Documents and Desktop sync to an employer's OneDrive), and not a network
 * share. Symbolic links and junctions are resolved first, so a link into OneDrive is caught.
 */
export function archiveRootProblems(root, { repoRoot, env = process.env, resolveReal = realpathOrSelf } = {}) {
  const problems = [];
  if (!root || !path.isAbsolute(root)) return ["the archive root must be an absolute path"];
  if (/^\\\\/.test(root) || /^\/\//.test(root)) problems.push("the archive root is a network path");
  const real = resolveReal(root);
  const inside = (child, parent) => {
    const rel = path.relative(path.resolve(parent), path.resolve(child));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  if (repoRoot && (inside(root, repoRoot) || inside(real, repoRoot))) problems.push("the archive root is inside the repository");
  for (const name of ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"]) {
    const sync = env[name];
    if (sync && (inside(root, sync) || inside(real, sync))) problems.push(`the archive root is inside a OneDrive folder (${name})`);
  }
  if (/onedrive/i.test(real)) problems.push("the archive root resolves into a OneDrive folder");
  return problems;
}

function realpathOrSelf(target) {
  // Resolve the deepest existing ancestor so a not-yet-created root is still checked through any junction above it.
  let current = path.resolve(target);
  const rest = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(target);
    rest.unshift(path.basename(current));
    current = parent;
  }
  try {
    return path.join(realpathSync.native(current), ...rest);
  } catch {
    return path.resolve(target);
  }
}

export function archiveId({ fixture, target, at = new Date() }) {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${fixture}-${target}-${stamp}`;
}

/** Exports avoid 13:00–15:00 UTC, when the daily digest writes ledger rows (vercel.json crons). */
export function digestWindowProblem(now = new Date()) {
  const hour = now.getUTCHours();
  return hour === 13 || hour === 14 ? "exports do not run between 13:00 and 15:00 UTC (daily digest slots)" : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Storage references
// ---------------------------------------------------------------------------------------------------------------------

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const STORAGE_URL = /\/storage\/v1\/object\/(public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;
const ORG_PATH = new RegExp(`^org/(${UUID})/`);

/** Which bucket a bare path stored in this column lives in (null = the column stores URLs or no paths). */
const BARE_PATH_BUCKET = Object.freeze({
  "documents.storage_path": "documents",
  "form_submissions.media_urls": "submissions",
  "form_submissions.submission_data_json": "submissions",
});

/**
 * Every Storage reference in a set of rows: bare `org/<uuid>/…` paths and Supabase Storage URLs, found by walking
 * EVERY string value (nested JSON included), not only the columns known to hold them.
 * @returns {{ table, id, column, pointer, bucket, path, kind: "path"|"url", host?: string }[]}
 */
export function scanStorageReferences(table, rows) {
  const out = [];
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      walk(value, `/${column}`, (text, pointer) => {
        const url = STORAGE_URL.exec(text);
        if (url && /^https?:\/\//i.test(text)) {
          let host = null;
          try {
            host = new URL(text).hostname.toLowerCase();
          } catch {
            host = null;
          }
          out.push({ table, id: row.id, column, pointer, bucket: url[2], path: decodeURIComponent(url[3]), kind: "url", host });
          return;
        }
        if (ORG_PATH.test(text)) {
          out.push({ table, id: row.id, column, pointer, bucket: BARE_PATH_BUCKET[`${table}.${column}`] ?? null, path: text, kind: "path" });
        }
      });
    }
  }
  return out;
}

function walk(value, pointer, visit) {
  if (typeof value === "string") visit(value, pointer);
  else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${pointer}/${i}`, visit));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walk(item, `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`, visit);
  }
}

/**
 * Why the references block an archive, or []: a bare path in a column with no known bucket, a path or URL of another
 * organization, or a Storage URL on a different project host.
 */
export function referenceProblems(references, { organizationId, projectHost }) {
  const problems = [];
  for (const ref of references) {
    const org = ORG_PATH.exec(ref.path)?.[1]?.toLowerCase() ?? null;
    if (ref.kind === "path" && !ref.bucket) problems.push(`${ref.table}.${ref.column} holds a Storage path in a column with no known bucket`);
    if (org && org !== organizationId) problems.push(`${ref.table}.${ref.column} references another organization's Storage objects`);
    if (!org && ref.kind === "path") problems.push(`${ref.table}.${ref.column} holds a path outside any organization prefix`);
    if (ref.kind === "url" && projectHost && ref.host && ref.host !== projectHost && /\.supabase\.(co|in)$/.test(ref.host)) {
      problems.push(`${ref.table}.${ref.column} holds a Storage URL on another Supabase project`);
    }
  }
  return [...new Set(problems)];
}

// ---------------------------------------------------------------------------------------------------------------------
// Coherence
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Compare the table snapshots taken at the start and end of an export ({ table: rows }). Tables in `growOnly` may gain
 * rows (scan_events past T0 are excluded anyway); any other difference means a concurrent write and an incoherent package.
 */
export function coherenceProblems(start, end, { growOnly = ["scan_events"] } = {}) {
  const problems = [];
  for (const table of new Set([...Object.keys(start), ...Object.keys(end)])) {
    if (growOnly.includes(table)) continue;
    if (tableHash(start[table] ?? []) !== tableHash(end[table] ?? [])) problems.push(`${table} changed during the export`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Writing and verifying a package (local files only)
// ---------------------------------------------------------------------------------------------------------------------

export const sumsLine = (hash, rel) => `${hash}  ${rel}`;

/** SHA256SUMS text for the files in `dir` (relative paths, forward slashes), excluding manifest.json and SHA256SUMS. */
export function buildSums(dir) {
  const lines = [];
  for (const rel of listFiles(dir)) {
    if (rel === "manifest.json" || rel === "SHA256SUMS") continue;
    lines.push(sumsLine(sha256(readFileSync(path.join(dir, rel))), rel));
  }
  return `${lines.sort().join("\n")}\n`;
}

export function listFiles(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(dir, rel));
    else out.push(rel);
  }
  return out;
}

export function writeJson(dir, rel, value) {
  const file = path.join(dir, ...rel.split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Store bytes under objects/<sha256>; identical content is written once. Returns the hash. */
export function writeObject(dir, bytes) {
  const hash = sha256(bytes);
  const file = path.join(dir, "objects", hash);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  return hash;
}

/**
 * Re-verify a package from its files alone. Returns { ok, problems, manifest }. Checks: the manifest exists and says
 * complete, SHA256SUMS matches manifest.data_files_sha256, every listed file exists with its hash, no unlisted data file
 * exists, every objects/<name> is named by its own hash, every rows file matches the manifest's per-table hash, and
 * every object in objects.json is present.
 */
export function verifyArchiveDir(dir) {
  const problems = [];
  const read = (rel) => readFileSync(path.join(dir, ...rel.split("/")));
  if (!existsSync(path.join(dir, "manifest.json"))) return { ok: false, problems: ["manifest.json is missing — not a complete package"], manifest: null };
  let manifest;
  try {
    manifest = JSON.parse(read("manifest.json").toString("utf8"));
  } catch {
    return { ok: false, problems: ["manifest.json is not valid JSON"], manifest: null };
  }
  if (manifest.schema !== ARCHIVE_SCHEMA) problems.push(`unknown package schema ${String(manifest.schema).slice(0, 60)}`);
  if (manifest.status !== "complete") problems.push(`package status is ${manifest.status}, not complete`);
  if (!existsSync(path.join(dir, "SHA256SUMS"))) return { ok: false, problems: [...problems, "SHA256SUMS is missing"], manifest };
  const sumsText = read("SHA256SUMS").toString("utf8");
  if (sha256(sumsText) !== manifest.data_files_sha256) problems.push("SHA256SUMS does not match the manifest");

  const listed = new Map();
  for (const line of sumsText.split("\n").filter(Boolean)) {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!m) {
      problems.push("SHA256SUMS has a malformed line");
      continue;
    }
    listed.set(m[2], m[1]);
  }
  for (const [rel, expected] of listed) {
    const file = path.join(dir, ...rel.split("/"));
    if (!existsSync(file)) {
      problems.push(`${rel} is listed but missing`);
      continue;
    }
    if (sha256(readFileSync(file)) !== expected) problems.push(`${rel} does not match its SHA-256`);
  }
  for (const rel of listFiles(dir)) {
    if (rel === "manifest.json" || rel === "SHA256SUMS" || rel.startsWith("restore-reports/")) continue;
    if (!listed.has(rel)) problems.push(`${rel} is not listed in SHA256SUMS`);
  }
  for (const rel of listFiles(dir).filter((r) => r.startsWith("objects/"))) {
    const name = rel.slice("objects/".length);
    if (/^[0-9a-f]{64}$/.test(name) && sha256(readFileSync(path.join(dir, "objects", name))) !== name) {
      problems.push(`object ${name.slice(0, 12)}… is not named by its own hash`);
    }
  }
  for (const [table, info] of Object.entries(manifest.tables ?? {})) {
    const rel = `rows/${table}.json`;
    if (!existsSync(path.join(dir, "rows", `${table}.json`))) {
      problems.push(`${rel} is missing`);
      continue;
    }
    const rows = JSON.parse(read(rel).toString("utf8"));
    if (rows.length !== info.rows) problems.push(`${rel} holds ${rows.length} rows, the manifest says ${info.rows}`);
    if (tableHash(rows) !== info.table_hash) problems.push(`${rel} does not match the manifest's table hash`);
  }
  if (existsSync(path.join(dir, "objects.json"))) {
    for (const object of JSON.parse(read("objects.json").toString("utf8"))) {
      if (!existsSync(path.join(dir, "objects", object.sha256))) problems.push(`object bytes for one ${object.bucket} object are missing`);
    }
  }
  return { ok: problems.length === 0, problems, manifest };
}

/** Total size in bytes of the files of a package directory. */
export function directoryBytes(dir) {
  return listFiles(dir).reduce((sum, rel) => sum + statSync(path.join(dir, ...rel.split("/"))).size, 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Restore preflight (pure parts)
// ---------------------------------------------------------------------------------------------------------------------

/** Exact column-set equality between archived rows and the target table (jsonb_populate_recordset drops/NULLs silently). */
export function columnSetProblems(tableRows, targetColumns) {
  const problems = [];
  for (const [table, rows] of Object.entries(tableRows)) {
    const target = targetColumns[table];
    if (!target) {
      problems.push(`target has no table ${table}`);
      continue;
    }
    if (rows.length === 0) continue;
    const archived = new Set(Object.keys(rows[0]));
    const live = new Set(target);
    for (const c of archived) if (!live.has(c)) problems.push(`${table}.${c} is in the archive but not on the target`);
    for (const c of live) if (!archived.has(c)) problems.push(`${table}.${c} is on the target but not in the archive`);
    if (rows.some((r) => Object.keys(r).length !== archived.size)) problems.push(`${table} rows do not all carry the same columns`);
  }
  return problems;
}

/** Objects a bucket's current rules would refuse (size or MIME type), so a restore can widen local rules knowingly. */
export function bucketRuleViolations(objects, buckets) {
  const out = [];
  for (const object of objects) {
    const bucket = buckets[object.bucket];
    if (!bucket) {
      out.push({ ...object, reason: "bucket does not exist" });
      continue;
    }
    if (bucket.file_size_limit && object.size > bucket.file_size_limit) out.push({ ...object, reason: "larger than the bucket limit" });
    if (Array.isArray(bucket.allowed_mime_types) && bucket.allowed_mime_types.length > 0 && !bucket.allowed_mime_types.includes(object.mimetype)) {
      out.push({ ...object, reason: "MIME type not allowed by the bucket" });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Redacted summary (the only part of a package that may be committed)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Counts and check results only: no object paths, no per-file hashes (tiny files of personal data would allow
 * guess-and-confirm), no names or addresses. The manifest hash identifies the package.
 */
export function redactedSummary(manifest, manifestSha256, extra = {}) {
  return {
    schema: "mulemark.phase-e.archive-summary/v1",
    archive_id: manifest.archive_id,
    created_at: manifest.created_at,
    source: { target: manifest.source.target, supabase_ref: manifest.source.supabase_ref, organization_id: manifest.source.organization_id, fixture: manifest.source.fixture },
    manifest_sha256: manifestSha256,
    graph_sha256: manifest.graph.sha256,
    tables: Object.fromEntries(Object.entries(manifest.tables).map(([t, info]) => [t, info.rows])),
    objects: { count: manifest.objects.count, bytes: manifest.objects.bytes, by_bucket: manifest.objects.by_bucket },
    references: manifest.references,
    identity: manifest.identity,
    protected: { routes: manifest.protected.routes, qr_links: manifest.protected.qr_link_ids.length, assets: manifest.protected.asset_ids.length },
    checks: manifest.checks,
    window: { t0: manifest.window.t0, t1: manifest.window.t1, scans_after_t0_excluded: manifest.window.scans_after_t0_excluded },
    custody: manifest.custody,
    ...extra,
  };
}
