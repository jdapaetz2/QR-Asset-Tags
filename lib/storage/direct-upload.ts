/**
 * Contract for single-file direct uploads from the admin dashboard — hosted documents and asset cover images.
 *
 * Vercel refuses Function request bodies over 4.5 MB before app code runs, so the file never travels through a server
 * action. A prepare action (signed-in user, own organization, asset visible under RLS, declared type/size valid)
 * returns one signed upload URL for a server-built path; the browser PUTs the file there; the save action receives
 * only that path and verifies the stored object (lib/storage/verify-object.ts) before any row references it.
 *
 * Pure: shared by the browser helper and the server actions.
 */

export type DeclaredUpload = { name?: string; size: number; type: string };

export type PreparedSingleUpload = { ok: true; path: string; signedUrl: string } | { ok: false; error: string };

export type PrepareSingleUploadAction = (declared: DeclaredUpload) => Promise<PreparedSingleUpload>;

export const FILE_UPLOAD_FAILED_MESSAGE =
  "We couldn't upload the file. Your entries are still here — check your connection and try again.";

export const FILE_VERIFY_FAILED_MESSAGE = "The uploaded file couldn't be verified. Choose it again and save.";

export const FILE_CHECK_FAILED_MESSAGE = "We couldn't check the uploaded file. Please try again.";

export const FILE_SAVE_FAILED_MESSAGE = "We couldn't save this. Your entries are still here — try again.";

export const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const UUID_RE = new RegExp(`^${UUID_PATTERN}$`);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Structurally sound declared metadata from the browser, or null. Values are re-validated by the caller. */
export function readDeclaredUpload(value: unknown): { size: number; type: string } | null {
  if (!value || typeof value !== "object") return null;
  const { size, type } = value as Record<string, unknown>;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return null;
  if (typeof type !== "string" || type.length === 0 || type.length > 100) return null;
  return { size, type };
}
