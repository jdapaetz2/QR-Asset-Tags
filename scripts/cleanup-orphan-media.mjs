#!/usr/bin/env node
/**
 * Operator orphan-media cleanup (Phase A4). Removes submission-photo objects whose owning
 * `form_submissions` row never materialized (a failed public upload) and that are older than a
 * conservative threshold. Honors the "never lose the record" invariant (docs/STORAGE_MEDIA_LIFECYCLE.md):
 * it deletes ONLY bytes with no matching record, and never touches a submission that has a row.
 *
 * SAFE BY CONSTRUCTION:
 *   - Dry-run by DEFAULT. Deletion requires BOTH --delete and --yes.
 *   - Only paths matching the exact submissions convention org/{uuid}/asset/{uuid}/submission/{uuid}/… are
 *     ever considered — never a broad bucket wipe.
 *   - For each submission prefix it checks form_submissions for a row; a row means SKIP.
 *   - Bounded batches (--limit). Prints counts + raw storage paths only — never signed URLs.
 *   - Requires the SERVICE-ROLE key; it is an operator tool, not a route, so customer roles cannot reach it.
 *
 * Usage:
 *   node scripts/cleanup-orphan-media.mjs                       # dry-run, 48h threshold
 *   node scripts/cleanup-orphan-media.mjs --older-than-hours=72
 *   node scripts/cleanup-orphan-media.mjs --delete --yes        # actually delete (bounded by --limit)
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (never printed).
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "submissions";

// Mirror of lib/ratelimit/orphan.ts (kept in sync; the predicate + regex are unit-tested there).
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const SUBMISSION_PREFIX_RE = new RegExp(`^org/(${UUID})/asset/(${UUID})/submission/(${UUID})$`);

function parseArgs(argv) {
  const args = { delete: false, yes: false, olderThanHours: 48, limit: 500 };
  for (const a of argv) {
    if (a === "--delete") args.delete = true;
    else if (a === "--yes") args.yes = true;
    else if (a.startsWith("--older-than-hours=")) args.olderThanHours = Number(a.split("=")[1]);
    else if (a.startsWith("--limit=")) args.limit = Number(a.split("=")[1]);
  }
  return args;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[orphan-cleanup] missing required env var ${name}`);
    process.exit(2);
  }
  return v;
}

/** Page through every entry under a storage prefix. */
async function listAll(supabase, prefix) {
  const out = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** Folder entries have a null id; file entries carry an id + metadata. */
const isFolder = (entry) => entry.id === null || entry.id === undefined;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const thresholdMs = args.olderThanHours * 3600 * 1000;
  const now = Date.now();

  console.log(
    `[orphan-cleanup] mode=${args.delete && args.yes ? "DELETE" : "DRY-RUN"} ` +
      `older-than=${args.olderThanHours}h limit=${args.limit} bucket=${BUCKET}`
  );

  const candidates = []; // { prefix, paths: string[], newestAgeH: number }
  let scannedPrefixes = 0;

  const orgs = (await listAll(supabase, "org")).filter(isFolder);
  for (const org of orgs) {
    const assets = (await listAll(supabase, `org/${org.name}/asset`)).filter(isFolder);
    for (const asset of assets) {
      const base = `org/${org.name}/asset/${asset.name}/submission`;
      const submissions = (await listAll(supabase, base)).filter(isFolder);
      for (const sub of submissions) {
        const prefix = `${base}/${sub.name}`;
        if (!SUBMISSION_PREFIX_RE.test(prefix)) continue; // never touch non-conforming paths
        scannedPrefixes++;

        const files = (await listAll(supabase, prefix)).filter((e) => !isFolder(e));
        if (files.length === 0) continue;

        // Newest object age (skip if we cannot determine an age — avoids racing an in-flight upload).
        const times = files
          .map((f) => (f.created_at ? new Date(f.created_at).getTime() : null))
          .filter((t) => t !== null);
        if (times.length === 0) continue;
        const newestAgeMs = now - Math.max(...times);
        if (newestAgeMs < thresholdMs) continue;

        // Does a submission row exist for this id? A row → keep (never delete recorded evidence).
        const { data: row, error } = await supabase
          .from("form_submissions")
          .select("id")
          .eq("id", sub.name)
          .maybeSingle();
        if (error) throw new Error(`form_submissions lookup ${sub.name}: ${error.message}`);
        if (row) continue;

        candidates.push({
          prefix,
          paths: files.map((f) => `${prefix}/${f.name}`),
          newestAgeH: Math.round(newestAgeMs / 3600000),
        });
      }
    }
  }

  const totalObjects = candidates.reduce((n, c) => n + c.paths.length, 0);
  console.log(
    `[orphan-cleanup] scanned ${scannedPrefixes} submission prefixes; ` +
      `${candidates.length} orphan prefixes / ${totalObjects} objects`
  );
  for (const c of candidates) {
    console.log(`  ORPHAN ${c.prefix}  (${c.paths.length} objects, ~${c.newestAgeH}h old)`);
    for (const p of c.paths) console.log(`    ${p}`);
  }

  if (!(args.delete && args.yes)) {
    console.log("[orphan-cleanup] dry-run — nothing deleted. Re-run with --delete --yes to remove.");
    return;
  }

  // Bounded deletion: at most --limit objects this run.
  const toDelete = [];
  for (const c of candidates) {
    for (const p of c.paths) {
      if (toDelete.length >= args.limit) break;
      toDelete.push(p);
    }
    if (toDelete.length >= args.limit) break;
  }
  if (toDelete.length === 0) {
    console.log("[orphan-cleanup] nothing to delete.");
    return;
  }
  const { data: removed, error: rmError } = await supabase.storage.from(BUCKET).remove(toDelete);
  if (rmError) {
    console.error(`[orphan-cleanup] delete failed: ${rmError.message}`);
    process.exit(1);
  }
  console.log(
    `[orphan-cleanup] deleted ${Array.isArray(removed) ? removed.length : 0} objects ` +
      `(requested ${toDelete.length}${totalObjects > args.limit ? `, more remain — re-run` : ""}).`
  );
}

main().catch((err) => {
  console.error("[orphan-cleanup] fatal:", err.message);
  process.exit(1);
});
