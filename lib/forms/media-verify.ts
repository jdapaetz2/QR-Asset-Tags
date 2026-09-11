import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { extForMime, isAllowedImageType, MAX_FILE_BYTES, mediaObjectName } from "@/lib/forms/media";
import { SUBMISSION_OBJECT_RE, SUBMISSION_PREFIX_RE } from "@/lib/ratelimit/orphan";
import { SNIFF_BYTES, sniffImageType } from "@/lib/media/sniff";
import {
  MEDIA_PATHS_FIELD,
  type DeclaredFile,
  type MediaClaim,
  type PreparedUpload,
} from "@/lib/forms/upload-contract";

/**
 * Direct-upload storage operations for ONE submission, and the server-side verification of what the browser
 * uploaded. Holds no credentials: the caller passes a bucket handle — the scoped service-role handle for public
 * intake (lib/forms/upload-intake.ts) or the staff user's RLS client — and every path is re-checked against the
 * submission's own prefix before any storage call.
 *
 * Deletion rules (evidence is never lost):
 *   - an object that FAILS content verification (type, size, bytes) is deleted — a committed submission can only
 *     reference objects that passed the same checks, so a failing object is never someone's evidence;
 *   - unclaimed objects under the prefix are deleted only AFTER this submission's row is committed;
 *   - nothing is deleted on a duplicate submit, a missing object or a transient storage failure — abandoned objects
 *     are swept by the orphan tool (scripts/cleanup-orphan-media.mjs), which never touches a prefix with a row.
 */

export const SUBMISSIONS_BUCKET = "submissions";

const LIST_LIMIT = 1000;
const SIGNED_READ_SECONDS = 60;

type StorageBucketApi = ReturnType<SupabaseClient["storage"]["from"]>;

export type ListedObject = { name: string; size: number | null; mimetype: string | null };

/** A submissions-bucket capability confined to one `org/{uuid}/asset/{uuid}/submission/{uuid}` prefix. */
export type ScopedSubmissionBucket = {
  readonly prefix: string;
  signUpload(path: string): Promise<string | null>;
  list(): Promise<ListedObject[] | null>;
  /** The first bytes of each object (null when unreadable). Signed read URLs never leave this function. */
  readHeads(paths: string[]): Promise<Map<string, Uint8Array | null>>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<boolean>;
  remove(paths: string[]): Promise<{ removed: number; failed: boolean }>;
};

export function isSubmissionPrefix(prefix: string): boolean {
  return SUBMISSION_PREFIX_RE.test(prefix);
}

/** A strict object path directly under this submission's prefix. */
export function isObjectUnderPrefix(prefix: string, path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith(`${prefix}/`) &&
    SUBMISSION_OBJECT_RE.test(path) &&
    !path.slice(prefix.length + 1).includes("..")
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const READ_HEAD_TIMEOUT_MS = 10_000;

/**
 * The first bytes of one object through a short-lived signed read with a Range header. The request is ABORTED once
 * enough bytes arrive (or on timeout) rather than awaiting `reader.cancel()`: inside Next's server runtime the fetch
 * body can be a tee whose cancel promise only settles when the other branch is also consumed, so awaiting it hung
 * the submission indefinitely. `no-store` keeps the read out of Next's fetch cache.
 */
async function readHead(fetchImpl: typeof fetch, url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_HEAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const out = new Uint8Array(SNIFF_BYTES);
    let filled = 0;
    while (filled < SNIFF_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const take = Math.min(value.byteLength, SNIFF_BYTES - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
    return out.subarray(0, filled);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export function scopedSubmissionBucket(
  bucket: StorageBucketApi,
  prefix: string,
  fetchImpl: typeof fetch = fetch
): ScopedSubmissionBucket {
  if (!isSubmissionPrefix(prefix)) throw new Error("invalid submission prefix");
  const assertPath = (path: string) => {
    if (!isObjectUnderPrefix(prefix, path)) throw new Error("path outside the submission prefix");
  };

  return {
    prefix,
    async signUpload(path) {
      assertPath(path);
      try {
        const { data, error } = await bucket.createSignedUploadUrl(path);
        return error || !data?.signedUrl ? null : data.signedUrl;
      } catch {
        return null;
      }
    },
    async list() {
      try {
        const { data, error } = await bucket.list(prefix, { limit: LIST_LIMIT });
        if (error || !data) return null;
        return data
          .filter((entry) => Boolean((entry as { id?: unknown }).id) && Boolean(entry.name))
          .map((entry) => {
            const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
            return { name: entry.name, size: numberOrNull(metadata.size), mimetype: stringOrNull(metadata.mimetype) };
          });
      } catch {
        return null;
      }
    },
    async readHeads(paths) {
      paths.forEach(assertPath);
      const heads = new Map<string, Uint8Array | null>();
      if (paths.length === 0) return heads;
      let signed: { path: string | null; signedUrl: string | null }[] = [];
      try {
        const { data, error } = await bucket.createSignedUrls(paths, SIGNED_READ_SECONDS);
        if (!error && data) signed = data;
      } catch {
        signed = [];
      }
      await Promise.all(
        paths.map(async (path) => {
          const url = signed.find((entry) => entry.path === path)?.signedUrl;
          heads.set(path, url ? await readHead(fetchImpl, url) : null);
        })
      );
      return heads;
    },
    async upload(path, bytes, contentType) {
      assertPath(path);
      try {
        const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });
        return !error;
      } catch {
        return false;
      }
    },
    async remove(paths) {
      paths.forEach(assertPath);
      if (paths.length === 0) return { removed: 0, failed: false };
      try {
        const { data, error } = await bucket.remove(paths);
        if (error) return { removed: 0, failed: true };
        return { removed: Array.isArray(data) ? data.length : 0, failed: false };
      } catch {
        return { removed: 0, failed: true };
      }
    },
  };
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

export type VerifyFailure = "claim" | "missing" | "content" | "total" | "storage";

export type VerifyResult =
  | { ok: true; media: VerifiedMedia[]; totalBytes: number }
  | { ok: false; reason: VerifyFailure; deleted: number };

/**
 * Every claim must be a strict path under this prefix that exists, is JPEG/PNG/WebP by stored type, extension AND
 * leading bytes, is non-empty and ≤ 10 MB, within the file count and (when given) total-byte caps. Objects failing
 * a content check are deleted; nothing else is.
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
    const heads = await bucket.readHeads(media.map((item) => item.path));
    for (const item of media) {
      const head = heads.get(item.path);
      if (!head) return reject("storage");
      const sniffed = sniffImageType(head);
      if (!sniffed || `image/${sniffed}` !== item.type) invalid.push(item.path);
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
