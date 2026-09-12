import { sniffDocumentType, sniffedTypeMatchesMime } from "@/lib/media/sniff";
import { scopedBucket, type ScopedBucket, type StorageBucketApi } from "@/lib/storage/scoped-bucket";
import type { ObjectRules } from "@/lib/storage/verify-object";
import {
  DOC_ALLOWED_TYPES,
  DOC_MAX_BYTES,
  DOCUMENT_OBJECT_RE,
  DOCUMENT_PREFIX_RE,
  extForDocumentMime,
} from "@/lib/documents/upload";

/**
 * Storage rules for hosted documents (direct upload, lib/storage/direct-upload.ts). The bucket handle always comes
 * from the signed-in user's RLS client, so the `documents org write/read/delete` storage policies (0005) still decide
 * which organization's paths the user may touch; this adds the per-document confinement and the content checks.
 */

/** A `documents` bucket capability confined to one `org/{org}/asset/{asset}/documents/{documentId}` prefix. */
export function documentStorage(bucketApi: StorageBucketApi, prefix: string): ScopedBucket {
  return scopedBucket(bucketApi, prefix, {
    label: "document",
    prefixRe: DOCUMENT_PREFIX_RE,
    objectRe: DOCUMENT_OBJECT_RE,
  });
}

/** PDF, image or video by stored type, extension and leading bytes; ≤ 50 MB. */
export const DOCUMENT_OBJECT_RULES: ObjectRules = {
  objectRe: DOCUMENT_OBJECT_RE,
  allowedTypes: DOC_ALLOWED_TYPES,
  maxBytes: DOC_MAX_BYTES,
  extForMime: extForDocumentMime,
  bytesMatch: (head, mime) => sniffedTypeMatchesMime(sniffDocumentType(head), mime),
};
