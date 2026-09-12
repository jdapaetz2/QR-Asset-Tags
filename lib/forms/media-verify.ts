import { randomUUID } from "node:crypto";

import { extForMime, isAllowedImageType, MAX_FILE_BYTES, mediaObjectName } from "@/lib/forms/media";
import { SUBMISSION_OBJECT_RE, SUBMISSION_PREFIX_RE } from "@/lib/ratelimit/orphan";
import { IMAGE_HEAD_MAX_BYTES, imageHeadComplete, isStoredImage } from "@/lib/media/classify";
import { isRecentUpload } from "@/lib/storage/verify-object";
import {
  isObjectUnderPrefix as isUnderPrefix,
  scopedBucket,
  type PathRules,
  type ScopedBucket,
  type StorageBucketApi,
} from "@/lib/storage/scoped-bucket";
import {
  MEDIA_PATHS_FIELD,
  type DeclaredFile,
  type MediaClaim,
  type PreparedUpload,
} from "@/lib/forms/upload-contract";

export type { ListedObject } from "@/lib/storage/scoped-bucket";

/**
 * Direct-upload storage operations for ONE submission, and the server-side verification of what the browser
 * uploaded. Holds no credentials: the caller passes a bucket handle — the scoped service-role handle for public
 * intake (lib/forms/upload-intake.ts) or the staff user's RLS client — and every path is re-checked against the
 * submission's own prefix before any storage call (lib/storage/scoped-bucket.ts).
 *
 * Deletion rules (evidence is never lost):
 *   - an object that FAILS content verification (type, size, bytes) is deleted — a committed submission can only
 *     reference objects that passed the same checks, so a failing object is never someone's evidence;
 *   - unclaimed objects under the prefix are deleted only AFTER this submission's row is committed;
 *   - nothing is deleted on a duplicate submit, a missing or stale object or a transient storage failure — abandoned
 *     objects are swept by the orphan tool (scripts/cleanup-orphan-media.mjs), which never touches a prefix with a row.
 */

export const SUBMISSIONS_BUCKET = "submissions";

/** A submissions-bucket capability confined to one `org/{uuid}/asset/{uuid}/submission/{uuid}` prefix. */
export type ScopedSubmissionBucket = ScopedBucket;

const SUBMISSION_PATH_RULES: PathRules = {
  label: "submission",
  prefixRe: SUBMISSION_PREFIX_RE,
  objectRe: SUBMISSION_OBJECT_RE,
};

export function isSubmissionPrefix(prefix: string): boolean {
  return SUBMISSION_PREFIX_RE.test(prefix);
}

/** A strict object path directly under this submission's prefix. */
export function isObjectUnderPrefix(prefix: string, path: unknown): path is string {
  return isUnderPrefix(prefix, path, SUBMISSION_OBJECT_RE);
}

export function scopedSubmissionBucket(
  bucket: StorageBucketApi,
  prefix: string,
  fetchImpl: typeof fetch = fetch
): ScopedSubmissionBucket {
  return scopedBucket(bucket, prefix, SUBMISSION_PATH_RULES, fetchImpl);
}

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

/** One signed upload URL per declared file, at a server-chosen opaque path. Null when any signing fails. */
export async function mintSignedUploads(
  bucket: ScopedSubmissionBucket,
  files: DeclaredFile[],
  newId: () => string = randomUUID
): Promise<PreparedUpload[] | null> {
  const planned = files.map((file) => ({ slotId: file.slotId, path: `${bucket.prefix}/${mediaObjectName(newId(), file.type)}` }));
  const signed = await Promise.all(planned.map((item) => bucket.signUpload(item.path)));
  if (signed.some((url) => !url)) return null;
  return planned.map((item, index) => ({ ...item, signedUrl: signed[index] as string }));
}

// ---------------------------------------------------------------------------
// Finalize
// ---------------------------------------------------------------------------

export type ClaimsRead = { kind: "none" } | { kind: "claims"; claims: MediaClaim[] } | { kind: "invalid" };

const MAX_CLAIMS_JSON = 20_000;

/** Parse `media_paths`. Absent or `[]` is "none"; anything malformed, duplicated or over `maxClaims` is invalid. */
export function readMediaClaims(formData: FormData, maxClaims: number): ClaimsRead {
  const raw = formData.get(MEDIA_PATHS_FIELD);
  if (raw === null) return { kind: "none" };
  if (typeof raw !== "string" || raw.length > MAX_CLAIMS_JSON) return { kind: "invalid" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid" };
  }
  if (!Array.isArray(parsed) || parsed.length > maxClaims) return { kind: "invalid" };
  if (parsed.length === 0) return { kind: "none" };
  const claims: MediaClaim[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
    const path = record?.path;
    const slotId = record?.slotId ?? null;
    if (typeof path !== "string" || path.length > 300 || seen.has(path)) return { kind: "invalid" };
    if (slotId !== null && (typeof slotId !== "string" || slotId.length === 0 || slotId.length > 100)) {
      return { kind: "invalid" };
    }
    seen.add(path);
    claims.push({ path, slotId });
  }
  return { kind: "claims", claims };
}

export type VerifiedMedia = { slotId: string | null; path: string; size: number; type: string };

export type VerifyFailure = "claim" | "missing" | "stale" | "content" | "total" | "storage";

export type VerifyResult =
  | { ok: true; media: VerifiedMedia[]; totalBytes: number }
  | { ok: false; reason: VerifyFailure; deleted: number };

/**
 * Every claim must be a strict path under this prefix that exists, was uploaded within the last 24 hours, is
 * JPEG/PNG/WebP by stored type, extension AND leading bytes with a readable frame size within 16,384 px per side and
 * 40 MP (read from up to the first 1 MB), is non-empty and ≤ 10 MB, within the file count and (when given) total-byte
 * caps. Objects failing a content check are deleted; nothing else is.
 */
export async function verifyClaimedMedia(
  bucket: ScopedSubmissionBucket,
  claims: MediaClaim[],
  limits: { maxFiles: number; maxTotalBytes: number | null }
): Promise<VerifyResult> {
  const reject = (reason: VerifyFailure, deleted = 0): VerifyResult => ({ ok: false, reason, deleted });
  if (claims.length === 0 || claims.length > limits.maxFiles) return reject("claim");
  if (claims.some((claim) => !isObjectUnderPrefix(bucket.prefix, claim.path))) return reject("claim");

  const listed = await bucket.list();
  if (!listed) return reject("storage");
  const byName = new Map(listed.map((object) => [object.name, object]));

  const media: VerifiedMedia[] = [];
  const invalid: string[] = [];
  for (const claim of claims) {
    const name = claim.path.slice(bucket.prefix.length + 1);
    const object = byName.get(name);
    if (!object) return reject("missing");
    if (!isRecentUpload(object.createdAt)) return reject("stale");
    const type = object.mimetype ?? "";
    const size = object.size ?? 0;
    const extensionMatches = name.toLowerCase().endsWith(`.${extForMime(type)}`);
    if (!isAllowedImageType(type) || !extensionMatches || size <= 0 || size > MAX_FILE_BYTES) {
      invalid.push(claim.path);
      continue;
    }
    media.push({ slotId: claim.slotId, path: claim.path, size, type });
  }

  if (invalid.length === 0) {
    const heads = await bucket.readHeads(
      media.map((item) => item.path),
      { maxBytes: IMAGE_HEAD_MAX_BYTES, isComplete: imageHeadComplete }
    );
    for (const item of media) {
      const head = heads.get(item.path);
      if (!head) return reject("storage");
      if (!isStoredImage(head, item.type)) invalid.push(item.path);
    }
  }

  if (invalid.length > 0) {
    const { removed } = await bucket.remove(invalid);
    return reject("content", removed);
  }

  const totalBytes = media.reduce((sum, item) => sum + item.size, 0);
  if (limits.maxTotalBytes !== null && totalBytes > limits.maxTotalBytes) return reject("total");
  return { ok: true, media, totalBytes };
}

/** After a committed row: delete objects under the prefix that the row does not reference (earlier retries). */
export async function removeUnclaimedObjects(bucket: ScopedSubmissionBucket, keep: string[]): Promise<number> {
  const listed = await bucket.list();
  if (!listed) return 0;
  const keepSet = new Set(keep);
  const extras = listed
    .map((object) => `${bucket.prefix}/${object.name}`)
    .filter((path) => !keepSet.has(path) && isObjectUnderPrefix(bucket.prefix, path));
  if (extras.length === 0) return 0;
  const { removed } = await bucket.remove(extras);
  return removed;
}
