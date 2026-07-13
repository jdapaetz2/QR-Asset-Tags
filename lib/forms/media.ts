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

// Guided return inspections allow more photos (overview + angles + damage), but with a hard total-byte
// cap so a submission stays well under the server-action body limit (next.config.ts) and storage cost
// stays bounded. Per-file size + allowed types are unchanged.
export const INSPECTION_MAX_FILES = 8;
export const INSPECTION_MAX_TOTAL_BYTES = 40 * 1024 * 1024; // 40 MB

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Extensions that legitimately accompany the allowed image MIME types. */
const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

export function isAllowedImageType(type: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function extForMime(type: string): string {
  return EXT_BY_MIME[type] ?? "bin";
}

/** Lowercased extension from a filename, or "" when absent. */
export function extFromName(name: string | undefined | null): string {
  if (!name) return "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Validate return-inspection media: images only, ≤10 MB each, ≤8 files, ≤40 MB total, and (when a
 * filename is present) an image extension consistent with the MIME allow-list. Returns an error
 * message or null. Zero files is valid here (per-slot minimums are enforced separately against the
 * template's required photo slots).
 */
export function validateInspectionFiles(
  files: { type: string; size: number; name?: string }[]
): string | null {
  if (files.length > INSPECTION_MAX_FILES) {
    return `Attach at most ${INSPECTION_MAX_FILES} photos.`;
  }
  let total = 0;
  for (const file of files) {
    if (!isAllowedImageType(file.type)) {
      return "Only JPG, PNG, or WebP images are allowed.";
    }
    const ext = extFromName(file.name);
    if (ext && !ALLOWED_IMAGE_EXTS.has(ext)) {
      return "Only JPG, PNG, or WebP images are allowed.";
    }
    if (file.size > MAX_FILE_BYTES) {
      return "Each photo must be 10 MB or smaller.";
    }
    total += file.size;
  }
  if (total > INSPECTION_MAX_TOTAL_BYTES) {
    return "Photos total more than 40 MB — remove some and try again.";
  }
  return null;
}

/**
 * Validate a set of uploaded files. Returns an error message or null. Media is
 * optional, so zero files is valid; when files are present they must all pass
 * the type/size/count checks.
 */
export function validateUploadFiles(
  files: { type: string; size: number }[]
): string | null {
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
