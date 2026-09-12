import { UUID_PATTERN } from "@/lib/storage/direct-upload";
import { sniffedTypeMatchesMime, type SniffedDocumentType } from "@/lib/media/sniff";

/**
 * Pure helpers for hosted document uploads. Files land in the private `documents`
 * bucket under an org/asset-scoped path the server builds (never client input).
 *
 * Documents are kept as uploaded — including HEIC/HEIF/AVIF phone and camera originals (D4.1, migration 0039), which
 * are offered as downloads because most browsers cannot display them.
 */

export const DOC_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/** File-picker hint: the allowed types plus the image extensions some systems leave untyped. */
export const DOC_ACCEPT = [...DOC_ALLOWED_TYPES, ".heic", ".heif", ".avif"].join(",");

export const DOC_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
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
    return "File must be a PDF, an image (JPG, PNG, WebP, HEIC, HEIF or AVIF), or a video (MP4, MOV or WebM).";
  }
  if (file.size > DOC_MAX_BYTES) {
    return "File must be 50 MB or smaller.";
  }
  return null;
}

const MIME_BY_SNIFFED: Record<SniffedDocumentType, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  mp4: "video/mp4",
  quicktime: "video/quicktime",
  webm: "video/webm",
};

/**
 * The type to upload a document as, from its bytes: the declared type when the bytes agree with it (a HEIC labelled
 * image/heif stays so), otherwise the bytes' own type. Null when the bytes are not a document kind — the declared type
 * is then left for the server to refuse. Windows often leaves HEIC untyped, and a file name proves nothing.
 */
export function documentMimeFromBytes(kind: SniffedDocumentType | null, declared: string): string | null {
  if (kind === null) return null;
  return sniffedTypeMatchesMime(kind, declared) ? declared : MIME_BY_SNIFFED[kind];
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
// Display
// ---------------------------------------------------------------------------

const FORMAT_BY_EXTENSION: Record<string, string> = {
  pdf: "PDF",
  jpg: "JPEG image",
  png: "PNG image",
  webp: "WebP image",
  heic: "HEIC image",
  heif: "HEIF image",
  avif: "AVIF image",
  mp4: "MP4 video",
  mov: "MOV video",
  webm: "WebM video",
};

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

/** "HEIC image", "PDF", … for a hosted file's storage path; null when the extension is unknown. */
export function documentFileFormat(storagePath: string): string | null {
  return FORMAT_BY_EXTENSION[extensionOf(storagePath)] ?? null;
}

/** HEIC and HEIF originals display only in Safari, so they are offered as a download rather than to open. */
export function documentOpensInBrowser(storagePath: string): boolean {
  const extension = extensionOf(storagePath);
  return extension !== "heic" && extension !== "heif";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  `^org/(${UUID_PATTERN})/asset/(${UUID_PATTERN})/documents/(${UUID_PATTERN})/(${UUID_PATTERN})\\.(pdf|jpg|png|webp|heic|heif|avif|mp4|mov|webm)$`
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
