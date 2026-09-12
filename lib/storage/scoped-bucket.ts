import type { SupabaseClient } from "@supabase/supabase-js";

import { SNIFF_BYTES } from "@/lib/media/sniff";

/**
 * A storage bucket capability confined to ONE server-built prefix — one submission, one hosted document, one asset's
 * cover folder. Every path is re-checked against that prefix and a strict object pattern before any storage call, so
 * a client-supplied path can never reach outside it.
 *
 * Holds no credentials: the caller passes a bucket handle from whichever client is appropriate — the signed-in
 * user's RLS client (admin documents and covers, staff checklists) or the scoped service-role handle for public
 * intake (lib/forms/upload-intake.ts).
 */

export type StorageBucketApi = ReturnType<SupabaseClient["storage"]["from"]>;

export type ListedObject = { name: string; size: number | null; mimetype: string | null; createdAt: string | null };

export type HeadReadOptions = {
  /** Read at most this many leading bytes (default: the sniffers' SNIFF_BYTES). */
  maxBytes?: number;
  /** Stop as soon as the bytes read so far are enough — e.g. once a JPEG's frame header has arrived. */
  isComplete?: (head: Uint8Array) => boolean;
};

export type ScopedBucket = {
  readonly prefix: string;
  signUpload(path: string): Promise<string | null>;
  list(): Promise<ListedObject[] | null>;
  /** The leading bytes of each object (null when unreadable). Signed read URLs never leave this function. */
  readHeads(paths: string[], options?: HeadReadOptions): Promise<Map<string, Uint8Array | null>>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<boolean>;
  remove(paths: string[]): Promise<{ removed: number; failed: boolean }>;
};

export type PathRules = {
  /** Names the kind of prefix in thrown messages ("submission", "document", "cover"). */
  label: string;
  /** The whole prefix, e.g. `org/{uuid}/asset/{uuid}/documents/{uuid}`. */
  prefixRe: RegExp;
  /** A strict object path directly under such a prefix. */
  objectRe: RegExp;
};

const LIST_LIMIT = 1000;
const SIGNED_READ_SECONDS = 60;
const READ_HEAD_TIMEOUT_MS = 10_000;

/** A strict object path directly under `prefix`. */
export function isObjectUnderPrefix(prefix: string, path: unknown, objectRe: RegExp): path is string {
  return (
    typeof path === "string" &&
    path.startsWith(`${prefix}/`) &&
    objectRe.test(path) &&
    !path.slice(prefix.length + 1).includes("..")
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The first bytes of one object through a short-lived signed read with a Range header. The request is ABORTED once
 * enough bytes arrive (or on timeout) rather than awaiting `reader.cancel()`: inside Next's server runtime the fetch
 * body can be a tee whose cancel promise only settles when the other branch is also consumed, so awaiting it hung
 * the request indefinitely. `no-store` keeps the read out of Next's fetch cache.
 */
async function readHead(fetchImpl: typeof fetch, url: string, options: HeadReadOptions): Promise<Uint8Array | null> {
  const maxBytes = options.maxBytes ?? SNIFF_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_HEAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { Range: `bytes=0-${maxBytes - 1}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const out = new Uint8Array(maxBytes);
    let filled = 0;
    while (filled < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const take = Math.min(value.byteLength, maxBytes - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
      if (options.isComplete?.(out.subarray(0, filled))) break;
    }
    return out.slice(0, filled);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export function scopedBucket(
  bucket: StorageBucketApi,
  prefix: string,
  rules: PathRules,
  fetchImpl: typeof fetch = fetch
): ScopedBucket {
  if (!rules.prefixRe.test(prefix)) throw new Error(`invalid ${rules.label} prefix`);
  const assertPath = (path: string) => {
    if (!isObjectUnderPrefix(prefix, path, rules.objectRe)) throw new Error(`path outside the ${rules.label} prefix`);
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
            return {
              name: entry.name,
              size: numberOrNull(metadata.size),
              mimetype: stringOrNull(metadata.mimetype),
              createdAt: stringOrNull((entry as { created_at?: unknown }).created_at),
            };
          });
      } catch {
        return null;
      }
    },
    async readHeads(paths, options = {}) {
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
          heads.set(path, url ? await readHead(fetchImpl, url, options) : null);
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
