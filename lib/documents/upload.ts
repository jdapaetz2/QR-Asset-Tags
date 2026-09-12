import { UUID_PATTERN } from "@/lib/storage/direct-upload";

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

// ---------------------------------------------------------------------------
// Direct upload (lib/storage/direct-upload.ts)
// ---------------------------------------------------------------------------

export const DOCUMENTS_BUCKET = "documents";

/** Form field carrying the uploaded object's path to `createDocument`. */
export const STORAGE_CLAIM_FIELD = "storage_claim";

/** `org/{org}/asset/{asset}/documents/{documentId}` */
export const DOCUMENT_PREFIX_RE = new RegExp(`^org/${UUID_PATTERN}/asset/${UUID_PATTERN}/documents/${UUID_PATTERN}$`);

/** `org/{org}/asset/{asset}/documents/{documentId}/{documentId}.{ext}` — the object is named after its document. */
export const DOCUMENT_OBJECT_RE = new RegExp(
  `^org/(${UUID_PATTERN})/asset/(${UUID_PATTERN})/documents/(${UUID_PATTERN})/(${UUID_PATTERN})\\.(pdf|jpg|png|webp|mp4|mov|webm)$`
);

export function extForDocumentMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null;
}

/** A claimed hosted-file path for exactly this organization and asset, or null. */
export function parseDocumentClaim(
  path: unknown,
  organizationId: string,
  assetId: string
): { documentId: string; path: string } | null {
  if (typeof path !== "string") return null;
  const m = DOCUMENT_OBJECT_RE.exec(path);
  if (!m || m[1] !== organizationId || m[2] !== assetId || m[3] !== m[4]) return null;
  return { documentId: m[3], path };
}
