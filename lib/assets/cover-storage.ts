import { IMAGE_HEAD_MAX_BYTES, imageHeadComplete, isStoredImage } from "@/lib/media/classify";
import { scopedBucket, type ScopedBucket, type StorageBucketApi } from "@/lib/storage/scoped-bucket";
import type { ObjectRules } from "@/lib/storage/verify-object";
import {
  COVER_ALLOWED_TYPES,
  COVER_MAX_BYTES,
  COVER_OBJECT_RE,
  COVER_PREFIX_RE,
  extForCoverMime,
} from "@/lib/assets/cover";

/**
 * Storage rules for asset cover images (direct upload, lib/storage/direct-upload.ts). The bucket handle always comes
 * from the signed-in user's RLS client, so the cover bucket's org storage policies (0002) still decide which
 * organization's paths the user may touch; this adds the per-asset confinement and the content checks.
 */

/** A cover-bucket capability confined to one `org/{org}/asset/{asset}/cover` prefix. */
export function coverStorage(bucketApi: StorageBucketApi, prefix: string): ScopedBucket {
  return scopedBucket(bucketApi, prefix, { label: "cover", prefixRe: COVER_PREFIX_RE, objectRe: COVER_OBJECT_RE });
}

/**
 * JPEG, PNG or WebP by stored type, extension and leading bytes, with a readable frame size within 16,384 px per side
 * and 40 MP (read from up to the first 1 MB); ≤ 5 MB.
 */
export const COVER_OBJECT_RULES: ObjectRules = {
  objectRe: COVER_OBJECT_RE,
  allowedTypes: COVER_ALLOWED_TYPES,
  maxBytes: COVER_MAX_BYTES,
  extForMime: extForCoverMime,
  bytesMatch: isStoredImage,
  head: { maxBytes: IMAGE_HEAD_MAX_BYTES, isComplete: imageHeadComplete },
};
