/**
 * Pure media-upload constraints and path helpers for damage-report uploads.
 * Images only for Sprint 4A (video deferred). Limits are enforced
 * authoritatively in the server action; the bucket MIME allow-list + size cap
 * are a backstop. Files live in the private `submissions` bucket under an
 * org/asset-scoped path the server builds (never client input).
 */

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES = 5;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isAllowedImageType(type: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function extForMime(type: string): string {
  return EXT_BY_MIME[type] ?? "bin";
}

/** Validate a set of uploaded files. Returns an error message or null. */
export function validateUploadFiles(
  files: { type: string; size: number }[]
): string | null {
  if (files.length === 0) return "Attach at least one photo.";
  if (files.length > MAX_FILES) return `Attach at most ${MAX_FILES} photos.`;
  for (const file of files) {
    if (!isAllowedImageType(file.type)) {
      return "Only JPG, PNG, or WebP images are allowed.";
    }
    if (file.size > MAX_FILE_BYTES) {
      return "Each photo must be 10 MB or smaller.";
    }
  }
  return null;
}

/** Server-built storage path prefix; matches the anon-insert policy (`org/{id}/...`). */
export function submissionPathPrefix(
  organizationId: string,
  assetId: string,
  submissionId: string
): string {
  return `org/${organizationId}/asset/${assetId}/submission/${submissionId}`;
}

/** Opaque, collision-free object name (no user-controlled filename). */
export function mediaObjectName(uuid: string, mime: string): string {
  return `${uuid}.${extForMime(mime)}`;
}
