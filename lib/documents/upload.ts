/**
 * Pure helpers for hosted document uploads. Files land in the private `documents`
 * bucket under an org/asset-scoped path the server builds (never client input).
 */

export const DOC_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const DOC_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function isAllowedDocType(type: string): boolean {
  return (DOC_ALLOWED_TYPES as readonly string[]).includes(type);
}

/** Validate a single hosted file. Returns an error message or null. */
export function validateDocumentFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!isAllowedDocType(file.type)) {
    return "File must be a PDF, image, or video (mp4/mov/webm).";
  }
  if (file.size > DOC_MAX_BYTES) {
    return "File must be 50 MB or smaller.";
  }
  return null;
}

/** Server-built path prefix; matches the documents bucket org policy (`org/{id}/...`). */
export function documentPathPrefix(
  organizationId: string,
  assetId: string,
  documentId: string
): string {
  return `org/${organizationId}/asset/${assetId}/documents/${documentId}`;
}

/** Opaque object name (no user-controlled filename). */
export function documentObjectName(documentId: string, mime: string): string {
  return `${documentId}.${EXT_BY_MIME[mime] ?? "bin"}`;
}
