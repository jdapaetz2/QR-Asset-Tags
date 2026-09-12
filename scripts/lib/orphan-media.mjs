/**
 * Abandoned-upload report and cleanup — the decisions (Phase A4; hardened and widened in Engineering Phase D4.1).
 * Pure: no network, no process.exit, no printing. scripts/cleanup-orphan-media.mjs lists, queries and removes; the
 * deletion loop takes its lookups and removals as injected functions so its stop rules are unit-tested.
 *
 * Browsers upload straight to storage before the row that references the object exists, so an abandoned form, a
 * refused save or a killed request can leave bytes nothing points at. The rule is "delete only bytes with no record":
 * an object is a candidate only when it follows a managed path grammar, nothing references it, and it is at least
 * the age floor old. Everything else is counted and never deleted.
 *
 * The grammars mirror the TypeScript sources; orphan-media.test.mjs checks the mirror against them.
 *   submissions    org/{org}/asset/{asset}/submission/{id}/{file}      lib/ratelimit/orphan.ts
 *   documents      org/{org}/asset/{asset}/documents/{id}/{id}.{ext}   lib/documents/upload.ts
 *   public-assets  org/{org}/asset/{asset}/cover/{uuid}.{ext}          lib/assets/cover.ts
 *   public-assets  org/{org}/logo/{uuid}.{ext}                         lib/org/logo.ts
 */

export const TARGETS = ["local", "staging", "production"];
/** Hosted targets never consider anything younger: signed upload URLs last 2 h and saves refuse objects over 24 h. */
export const MIN_AGE_HOURS = 48;
export const DEFAULT_MAX_DELETE = 50;
export const MAX_DELETE_CAP = 200;

export const SUBMISSIONS_BUCKET = "submissions";
export const DOCUMENTS_BUCKET = "documents";
export const PUBLIC_ASSETS_BUCKET = "public-assets";
export const BUCKETS = [SUBMISSIONS_BUCKET, DOCUMENTS_BUCKET, PUBLIC_ASSETS_BUCKET];

const UUID_ANY_CASE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const SUBMISSION_OBJECT_RE = new RegExp(
  `^org/(${UUID_ANY_CASE})/asset/(${UUID_ANY_CASE})/submission/(${UUID_ANY_CASE})/[^/]+$`
);
const DOCUMENT_OBJECT_RE = new RegExp(
  `^org/(${UUID})/asset/(${UUID})/documents/(${UUID})/(${UUID})\\.(pdf|jpg|png|webp|mp4|mov|webm)$`
);
const COVER_OBJECT_RE = new RegExp(`^org/(${UUID})/asset/(${UUID})/cover/${UUID}\\.(jpg|png|webp)$`);
const LOGO_OBJECT_RE = new RegExp(`^org/(${UUID})/logo/${UUID}\\.(jpg|png|webp)$`);

// ---------------------------------------------------------------------------
// Arguments and target
// ---------------------------------------------------------------------------

const VALUE_FLAGS = new Set(["--target", "--older-than-hours", "--max-delete", "--confirm"]);
const BARE_FLAGS = new Set(["--delete", "--acknowledge-production-deletion", "--verbose"]);

/** A plain decimal integer — no sign, exponent, fraction, unit or blank (Number("") is 0; Number("12h") is NaN). */
function strictInteger(value) {
  return typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : null;
}

/**
 * Strict argument parsing: an unknown or repeated flag, a malformed number or a missing target is an error, never
 * a silent default. Errors name the flag only, never the value that was passed.
 * @returns {{ ok: true, args: CleanupArgs } | { ok: false, error: string }}
 */
export function parseCleanupArgs(argv) {
  const args = {
    target: null,
    olderThanHours: MIN_AGE_HOURS,
    maxDelete: DEFAULT_MAX_DELETE,
    delete: false,
    confirm: null,
    acknowledgeProduction: false,
    verbose: false,
  };
  const fail = (error) => ({ ok: false, error });
  const seen = new Set();

  for (const raw of argv) {
    const eq = raw.indexOf("=");
    const flag = eq === -1 ? raw : raw.slice(0, eq);
    const value = eq === -1 ? null : raw.slice(eq + 1);
    if (!VALUE_FLAGS.has(flag) && !BARE_FLAGS.has(flag)) return fail(`unknown argument ${flag.startsWith("--") ? flag : "(positional)"}`);
    if (seen.has(flag)) return fail(`${flag} was given more than once`);
    seen.add(flag);
    if (BARE_FLAGS.has(flag) && value !== null) return fail(`${flag} takes no value`);
    if (VALUE_FLAGS.has(flag) && !value) return fail(`${flag} needs a value (${flag}=…)`);

    if (flag === "--target") {
      if (!TARGETS.includes(value)) return fail(`--target must be one of: ${TARGETS.join(", ")}`);
      args.target = value;
    } else if (flag === "--older-than-hours") {
      const hours = strictInteger(value);
      if (hours === null) return fail("--older-than-hours must be a whole number of hours");
      args.olderThanHours = hours;
    } else if (flag === "--max-delete") {
      const max = strictInteger(value);
      if (max === null || max < 1 || max > MAX_DELETE_CAP) {
        return fail(`--max-delete must be a whole number from 1 to ${MAX_DELETE_CAP}`);
      }
      args.maxDelete = max;
    } else if (flag === "--confirm") {
      args.confirm = value;
    } else if (flag === "--delete") {
      args.delete = true;
    } else if (flag === "--acknowledge-production-deletion") {
      args.acknowledgeProduction = true;
    } else if (flag === "--verbose") {
      args.verbose = true;
    }
  }

  if (!args.target) return fail(`--target is required (${TARGETS.join(", ")})`);
  if (args.target !== "local" && args.olderThanHours < MIN_AGE_HOURS) {
    return fail(`--older-than-hours cannot be below ${MIN_AGE_HOURS} on ${args.target}`);
  }
  if (!args.delete && (args.confirm !== null || args.acknowledgeProduction)) {
    return fail("--confirm and --acknowledge-production-deletion only apply with --delete");
  }
  return { ok: true, args };
}

/** The target must be stated in the environment as well as on the command line, and both must agree. */
export function declaredTargetProblem(argTarget, envTarget) {
  if (!envTarget) {
    return `MULEMARK_TARGET is not set. The target is never inferred: set MULEMARK_TARGET=${argTarget} in the env file this command loads.`;
  }
  if (envTarget !== argTarget) {
    const shown = TARGETS.includes(envTarget) ? envTarget : "an unrecognised value";
    return `MULEMARK_TARGET is ${shown} but --target is ${argTarget}; refusing to run.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classification and references
// ---------------------------------------------------------------------------

/**
 * Which managed object, if any, a stored path is. Anything that does not match its bucket's grammar exactly is
 * "unmanaged" and never a deletion candidate.
 */
export function classifyObject(bucket, path) {
  if (typeof path !== "string" || path.includes("..")) return { kind: "unmanaged" };
  if (bucket === SUBMISSIONS_BUCKET) {
    const m = SUBMISSION_OBJECT_RE.exec(path);
    if (m) return { kind: "submission", org: m[1].toLowerCase(), submissionId: m[3].toLowerCase() };
  } else if (bucket === DOCUMENTS_BUCKET) {
    const m = DOCUMENT_OBJECT_RE.exec(path);
    if (m && m[3] === m[4]) return { kind: "document", org: m[1], documentId: m[3] };
  } else if (bucket === PUBLIC_ASSETS_BUCKET) {
    const cover = COVER_OBJECT_RE.exec(path);
    if (cover) return { kind: "cover", org: cover[1] };
    const logo = LOGO_OBJECT_RE.exec(path);
    if (logo) return { kind: "logo", org: logo[1] };
  }
  return { kind: "unmanaged" };
}

const PUBLIC_URL_MARKER = `/storage/v1/object/public/${PUBLIC_ASSETS_BUCKET}/`;

/** The public-assets object a stored public URL names (cover_image_url, logo_url), or null. */
export function publicObjectPath(url) {
  if (typeof url !== "string") return null;
  const index = url.indexOf(PUBLIC_URL_MARKER);
  if (index === -1) return null;
  const path = url.slice(index + PUBLIC_URL_MARKER.length).split(/[?#]/)[0];
  return path || null;
}

function isAtLeastHoursOld(createdAt, now, hours) {
  const created = typeof createdAt === "string" ? Date.parse(createdAt) : NaN;
  // An unknown age is never old enough: it could be an upload still in flight.
  return Number.isFinite(created) && now - created >= hours * 3_600_000;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * @typedef {{ bucket: string, path: string, size: number | null, createdAt: string | null }} StoredObject
 * @typedef {{
 *   submissionMedia: Map<string, Set<string>>, // submission ids that have a row → the media paths the row records
 *   documentPaths: Set<string>,                // every documents.storage_path
 *   publicAssetPaths: Set<string>,             // every public-assets object named by any cover_image_url or logo_url
 * }} References
 */

/**
 * Decide the candidates. A submission's objects are judged together: its whole prefix is a candidate only when no
 * row exists for the id and every object in it is old enough. A cover or logo is protected by any stored URL, not
 * just its own asset's or organization's.
 * @param {{ objects: StoredObject[], refs: References, now: number, olderThanHours: number }} input
 */
export function planCleanup({ objects, refs, now, olderThanHours }) {
  const candidates = [];
  const report = {
    scanned: objects.length,
    referenced: 0,
    tooNew: 0,
    unmanaged: 0,
    extraUnderRecordedSubmission: 0,
    documentRowsMissingObject: 0,
  };
  const submissions = new Map();
  const listedDocuments = new Set();

  for (const object of objects) {
    const info = classifyObject(object.bucket, object.path);
    if (object.bucket === DOCUMENTS_BUCKET) listedDocuments.add(object.path);
    if (info.kind === "unmanaged") {
      report.unmanaged++;
      continue;
    }
    if (info.kind === "submission") {
      const group = submissions.get(info.submissionId) ?? { org: info.org, objects: [] };
      group.objects.push(object);
      submissions.set(info.submissionId, group);
      continue;
    }
    const referenced =
      info.kind === "document" ? refs.documentPaths.has(object.path) : refs.publicAssetPaths.has(object.path);
    if (referenced) {
      report.referenced++;
    } else if (!isAtLeastHoursOld(object.createdAt, now, olderThanHours)) {
      report.tooNew++;
    } else {
      candidates.push({ ...object, kind: info.kind, org: info.org });
    }
  }

  for (const [submissionId, group] of submissions) {
    const recorded = refs.submissionMedia.get(submissionId);
    if (recorded) {
      // A recorded submission is never touched. Objects its row does not list are reported for a person to look at.
      report.referenced += group.objects.length;
      report.extraUnderRecordedSubmission += group.objects.filter((o) => !recorded.has(o.path)).length;
    } else if (!group.objects.every((o) => isAtLeastHoursOld(o.createdAt, now, olderThanHours))) {
      report.tooNew += group.objects.length;
    } else {
      for (const object of group.objects) candidates.push({ ...object, kind: "submission", org: group.org, submissionId });
    }
  }

  for (const path of refs.documentPaths) if (!listedDocuments.has(path)) report.documentRowsMissingObject++;

  // Oldest first, so a capped run always removes the stalest residue.
  candidates.sort((a, b) => (Date.parse(a.createdAt) - Date.parse(b.createdAt)) || a.path.localeCompare(b.path));
  return { candidates, report, summary: summarizeCandidates(candidates) };
}

/** Object counts and bytes, by kind and by organization. */
export function summarizeCandidates(candidates) {
  const total = { objects: 0, bytes: 0 };
  const byKind = {};
  const byOrg = {};
  for (const candidate of candidates) {
    const bytes = Number.isFinite(candidate.size) ? candidate.size : 0;
    for (const bucket of [total, (byKind[candidate.kind] ??= { objects: 0, bytes: 0 }), (byOrg[candidate.org] ??= { objects: 0, bytes: 0 })]) {
      bucket.objects++;
      bucket.bytes += bytes;
    }
  }
  return { total, byKind, byOrg };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/** The exact confirmation a deleting run needs: the target and this run's live candidate count. */
export function expectedConfirmation(target, candidateCount) {
  return `${target}:${candidateCount}`;
}

/** Why a deleting run must not proceed, or null when it may. */
export function deletionRefusal(args, candidateCount) {
  if (!args.delete) return "not a deleting run";
  const expected = expectedConfirmation(args.target, candidateCount);
  if (args.confirm !== expected) {
    return `--confirm must be exactly ${expected} (the target and the candidate count this run found)`;
  }
  if (args.target === "production" && !args.acknowledgeProduction) {
    return "deleting on production also needs --acknowledge-production-deletion";
  }
  return null;
}

export function selectForDeletion(candidates, maxDelete) {
  return candidates.slice(0, Math.min(maxDelete, MAX_DELETE_CAP));
}

/**
 * Remove objects one at a time. Each is re-checked immediately before removal: one that became referenced is
 * skipped, and a re-check that cannot answer stops the run before anything further is removed.
 * @param {{ selected: object[], isReferencedNow: (c: object) => Promise<boolean>, removeObject: (c: object) => Promise<boolean> }} io
 */
export async function runDeletion({ selected, isReferencedNow, removeObject }) {
  const result = { removed: 0, removedBytes: 0, skippedNowReferenced: 0, failed: 0, aborted: false };
  for (const candidate of selected) {
    let referenced;
    try {
      referenced = await isReferencedNow(candidate);
    } catch {
      result.aborted = true;
      break;
    }
    if (referenced) {
      result.skippedNowReferenced++;
      continue;
    }
    let removed = false;
    try {
      removed = await removeObject(candidate);
    } catch {
      removed = false;
    }
    if (removed) {
      result.removed++;
      result.removedBytes += Number.isFinite(candidate.size) ? candidate.size : 0;
    } else {
      result.failed++;
    }
  }
  return result;
}
