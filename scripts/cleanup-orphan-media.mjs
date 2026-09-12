#!/usr/bin/env node
/**
 * Abandoned-upload report and cleanup (Phase A4; hardened and widened in Engineering Phase D4.1).
 *
 * Browsers upload submission photos, hosted documents and cover images straight to storage before the row that
 * references them exists. This operator tool finds objects nothing references in the submissions, documents and
 * public-assets buckets and, only when told exactly what to delete, removes them one at a time. The decisions live
 * in scripts/lib/orphan-media.mjs (unit-tested); this file lists, queries and removes.
 *
 * SAFE BY CONSTRUCTION
 *   - Report by default. Deleting needs --delete and --confirm=<target>:<candidate count from this run>; production
 *     also needs --acknowledge-production-deletion. Never scheduled.
 *   - The target is stated twice and verified: --target and MULEMARK_TARGET must agree, and the Supabase URL must
 *     resolve to that target (scripts/lib/env-target.mjs; anything unrecognised is treated as production).
 *   - Only managed path grammars are candidates, only when unreferenced and at least 48 hours old. Other paths are
 *     counted, never deleted. Each object is re-checked just before removal; a re-check that fails stops the run.
 *   - At most --max-delete objects per run (default 50, never more than 200). Any listing or reference query error
 *     stops the run before anything is decided.
 *   - Counts and bytes by default; object paths only with --verbose. Never prints keys or signed URLs.
 *
 * Usage (docs/ORPHAN_MEDIA_CLEANUP.md):
 *   npm run cleanup:orphans:staging
 *   npm run cleanup:orphans:staging -- --verbose
 *   npm run cleanup:orphans:staging -- --delete --confirm=staging:12
 *   npm run cleanup:orphans:production
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (never printed), MULEMARK_TARGET, and
 * STAGING_SUPABASE_REF on staging.
 */
import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "./lib/env-target.mjs";
import {
  BUCKETS,
  DOCUMENTS_BUCKET,
  PUBLIC_ASSETS_BUCKET,
  SUBMISSIONS_BUCKET,
  classifyObject,
  declaredTargetProblem,
  deletionRefusal,
  expectedConfirmation,
  formatBytes,
  parseCleanupArgs,
  planCleanup,
  publicObjectPath,
  runDeletion,
  selectForDeletion,
} from "./lib/orphan-media.mjs";

const LOG = "[orphan-media]";
const PAGE = 1000;
const ID_CHUNK = 100;
const MAX_OBJECTS_PER_BUCKET = 200_000;
const MAX_DEPTH = 8;

function exitWith(code, message) {
  console.error(`${LOG} ${message}`);
  process.exit(code);
}

/** Every object in a bucket, walking folders. Errors name the bucket only. */
async function listBucket(supabase, bucket) {
  const objects = [];
  const pending = [{ prefix: "", depth: 0 }];
  while (pending.length > 0) {
    const { prefix, depth } = pending.pop();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`could not list the ${bucket} bucket`);
      const rows = data ?? [];
      for (const entry of rows) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        // Folder entries have no id; file entries carry an id and metadata.
        if (entry.id === null || entry.id === undefined) {
          if (depth + 1 > MAX_DEPTH) throw new Error(`the ${bucket} bucket is nested deeper than expected`);
          pending.push({ prefix: path, depth: depth + 1 });
        } else {
          objects.push({ bucket, path, size: entry.metadata?.size ?? null, createdAt: entry.created_at ?? null });
          if (objects.length > MAX_OBJECTS_PER_BUCKET) throw new Error(`the ${bucket} bucket holds more objects than this tool scans`);
        }
      }
      if (rows.length < PAGE) break;
    }
  }
  return objects;
}

/** Every non-null value of one column, paged. */
async function readColumn(supabase, table, column) {
  const values = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${column}`)
      .not(column, "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`could not read ${table}.${column}`);
    for (const row of data ?? []) values.push(row[column]);
    if ((data ?? []).length < PAGE) break;
  }
  return values;
}

async function loadReferences(supabase, objects) {
  const submissionIds = [
    ...new Set(
      objects
        .map((o) => classifyObject(o.bucket, o.path))
        .filter((info) => info.kind === "submission")
        .map((info) => info.submissionId)
    ),
  ];
  const submissionMedia = new Map();
  for (let i = 0; i < submissionIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from("form_submissions")
      .select("id, media_urls")
      .in("id", submissionIds.slice(i, i + ID_CHUNK));
    if (error) throw new Error("could not read form_submissions");
    for (const row of data ?? []) {
      const media = Array.isArray(row.media_urls) ? row.media_urls.filter((p) => typeof p === "string") : [];
      submissionMedia.set(String(row.id).toLowerCase(), new Set(media));
    }
  }

  const documentPaths = new Set(await readColumn(supabase, "documents", "storage_path"));
  const publicUrls = [
    ...(await readColumn(supabase, "assets", "cover_image_url")),
    ...(await readColumn(supabase, "organizations", "logo_url")),
  ];
  const publicAssetPaths = new Set(publicUrls.map(publicObjectPath).filter(Boolean));
  return { submissionMedia, documentPaths, publicAssetPaths };
}

/** A fresh answer, just before removal, to "does anything reference this object now?". Throws when it cannot tell. */
async function isReferencedNow(supabase, candidate) {
  const found = async (query, label) => {
    const { data, error } = await query.limit(1);
    if (error) throw new Error(`re-check of ${label} failed`);
    return (data ?? []).length > 0;
  };
  if (candidate.kind === "submission") {
    return found(supabase.from("form_submissions").select("id").eq("id", candidate.submissionId), "form_submissions");
  }
  if (candidate.kind === "document") {
    return found(supabase.from("documents").select("id").eq("storage_path", candidate.path), "documents");
  }
  const marker = `%/${PUBLIC_ASSETS_BUCKET}/${candidate.path}%`;
  return (
    (await found(supabase.from("assets").select("id").like("cover_image_url", marker), "assets")) ||
    (await found(supabase.from("organizations").select("id").like("logo_url", marker), "organizations"))
  );
}

async function removeObject(supabase, candidate) {
  const { data, error } = await supabase.storage.from(candidate.bucket).remove([candidate.path]);
  return !error && Array.isArray(data) && data.length === 1;
}

function printPlan({ summary, report, candidates }, args) {
  console.log(
    `${LOG} scanned ${report.scanned} objects in ${BUCKETS.join(", ")}; ` +
      `candidates: ${summary.total.objects} objects, ${formatBytes(summary.total.bytes)}`
  );
  for (const [kind, totals] of Object.entries(summary.byKind)) {
    console.log(`  ${kind}: ${totals.objects} objects, ${formatBytes(totals.bytes)}`);
  }
  for (const [org, totals] of Object.entries(summary.byOrg)) {
    console.log(`  organization ${org}: ${totals.objects} objects, ${formatBytes(totals.bytes)}`);
  }
  console.log(
    `${LOG} kept: ${report.referenced} referenced, ${report.tooNew} newer than ${args.olderThanHours}h, ` +
      `${report.unmanaged} outside the managed paths`
  );
  console.log(
    `${LOG} for review (never deleted): ${report.extraUnderRecordedSubmission} objects under recorded submissions ` +
      `that the row does not list; ${report.documentRowsMissingObject} document rows whose file is missing`
  );
  if (args.verbose) {
    for (const c of candidates) console.log(`    ${c.bucket} ${c.path} (${formatBytes(c.size ?? 0)}, created ${c.createdAt})`);
  }
}

async function main() {
  const parsed = parseCleanupArgs(process.argv.slice(2));
  if (!parsed.ok) exitWith(2, parsed.error);
  const { args } = parsed;

  const declared = declaredTargetProblem(args.target, process.env.MULEMARK_TARGET);
  if (declared) exitWith(2, declared);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) exitWith(2, "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

  let resolved;
  try {
    resolved = assertTarget(args.target, { supabaseUrl: url, expectedStagingRef: process.env.STAGING_SUPABASE_REF || null });
  } catch (err) {
    exitWith(2, err.message);
  }

  const mode = args.delete ? "DELETE" : "REPORT";
  console.log(
    `${LOG} target=${resolved.target} host=${resolved.host}${resolved.ref ? ` ref=${resolved.ref}` : ""} ` +
      `mode=${mode} older-than=${args.olderThanHours}h max-delete=${args.maxDelete}`
  );

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const objects = [];
  for (const bucket of [SUBMISSIONS_BUCKET, DOCUMENTS_BUCKET, PUBLIC_ASSETS_BUCKET]) {
    objects.push(...(await listBucket(supabase, bucket)));
  }
  const refs = await loadReferences(supabase, objects);
  const plan = planCleanup({ objects, refs, now: Date.now(), olderThanHours: args.olderThanHours });
  printPlan(plan, args);

  const count = plan.candidates.length;
  if (!args.delete) {
    console.log(
      `${LOG} report only — nothing deleted.` +
        (count > 0
          ? ` To remove up to ${Math.min(args.maxDelete, count)} of these after review, re-run with ` +
            `--delete --confirm=${expectedConfirmation(args.target, count)}` +
            (args.target === "production" ? " --acknowledge-production-deletion" : "")
          : "")
    );
    return;
  }
  if (count === 0) {
    console.log(`${LOG} nothing to delete.`);
    return;
  }
  const refusal = deletionRefusal(args, count);
  if (refusal) exitWith(2, `refusing to delete: ${refusal}`);

  const selected = selectForDeletion(plan.candidates, args.maxDelete);
  const result = await runDeletion({
    selected,
    isReferencedNow: (candidate) => isReferencedNow(supabase, candidate),
    removeObject: (candidate) => removeObject(supabase, candidate),
  });
  console.log(
    `${LOG} removed ${result.removed} of ${selected.length} selected (${formatBytes(result.removedBytes)}); ` +
      `skipped ${result.skippedNowReferenced} now referenced; ${result.failed} failed` +
      (count > selected.length ? `; ${count - selected.length} candidates remain for a later run` : "")
  );
  if (result.aborted) exitWith(1, "stopped: a re-check could not confirm an object was still unreferenced");
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((err) => exitWith(1, `stopped: ${err.message}`));
