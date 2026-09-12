import { isObjectUnderPrefix, type ScopedBucket } from "@/lib/storage/scoped-bucket";

/**
 * Server-side verification of ONE file a signed-in user uploaded straight to storage (hosted documents, asset cover
 * images), before any row references it. Nothing from the browser is trusted: the stored object is listed, its
 * stored type, extension, size and leading bytes are checked against the kind's rules.
 *
 * Deletion rule: only an object that fails a content check is deleted (nothing legitimate can ever reference it). A
 * missing object or a storage error deletes nothing.
 */

export type ObjectRules = {
  /** The strict object pattern for this kind; the claim must match it directly under the bucket's prefix. */
  objectRe: RegExp;
  allowedTypes: readonly string[];
  maxBytes: number;
  /** The extension a stored MIME type must carry, or null when the type has none. */
  extForMime: (mime: string) => string | null;
  /** Whether the object's leading bytes are the stored type. */
  bytesMatch: (head: Uint8Array, mime: string) => boolean;
};

export type ObjectVerifyFailure = "claim" | "missing" | "content" | "storage";

export type VerifyObjectResult =
  | { ok: true; path: string; size: number; type: string }
  | { ok: false; reason: ObjectVerifyFailure; deleted: boolean };

export async function verifyClaimedObject(
  bucket: ScopedBucket,
  path: unknown,
  rules: ObjectRules
): Promise<VerifyObjectResult> {
  const fail = (reason: ObjectVerifyFailure, deleted = false): VerifyObjectResult => ({ ok: false, reason, deleted });
  if (!isObjectUnderPrefix(bucket.prefix, path, rules.objectRe)) return fail("claim");
  const name = path.slice(bucket.prefix.length + 1);

  const listed = await bucket.list();
  if (!listed) return fail("storage");
  const object = listed.find((entry) => entry.name === name);
  if (!object) return fail("missing");

  const type = object.mimetype ?? "";
  const size = object.size ?? 0;
  const ext = rules.extForMime(type);
  let valid =
    rules.allowedTypes.includes(type) &&
    ext !== null &&
    name.toLowerCase().endsWith(`.${ext}`) &&
    size > 0 &&
    size <= rules.maxBytes;

  if (valid) {
    const head = (await bucket.readHeads([path])).get(path);
    if (!head) return fail("storage");
    valid = rules.bytesMatch(head, type);
  }

  if (!valid) {
    const { removed } = await bucket.remove([path]);
    return fail("content", removed > 0);
  }
  return { ok: true, path, size, type };
}
