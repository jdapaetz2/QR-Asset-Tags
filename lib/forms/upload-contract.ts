/**
 * The browser ↔ server contract for direct photo uploads. Pure — imported by client components and server cores.
 *
 * Vercel rejects any Function request body over 4.5 MB before our code runs (413 FUNCTION_PAYLOAD_TOO_LARGE), so
 * photos no longer travel inside the server-action body:
 *
 *   1. prepare  — a server action receives only file metadata, runs the intake gates, and returns one path-bound
 *                 signed upload URL per photo (lib/forms/upload-prepare.ts);
 *   2. upload   — the browser PUTs each photo straight to Supabase Storage (lib/forms/upload-client.ts);
 *   3. finalize — the existing submit action receives the answers plus `media_paths` (JSON claims) and verifies
 *                 every object before the submission row references it (lib/forms/media-verify.ts).
 *
 * Without JavaScript the form still posts files through the server action (small totals only).
 */

/** FormData field carrying the JSON `MediaClaim[]` on a direct-upload finalize. */
export const MEDIA_PATHS_FIELD = "media_paths";

/** Hard bound on declared files before any other validation (the app caps are 5 and 8). */
export const MAX_DECLARED_FILES = 20;

export type DeclaredFile = {
  /** Photo slot id for checklist flows; null for the damage/support `media` field. */
  slotId: string | null;
  name: string;
  size: number;
  type: string;
};

export type PrepareUploadsRequest = {
  /** The form's idempotency token (UUID). The server returns the id it actually used. */
  submissionId: string;
  /** The honeypot value; a filled one gets an empty, silent success. */
  honeypot: string;
  files: DeclaredFile[];
};

export type PreparedUpload = { slotId: string | null; path: string; signedUrl: string };

export type PrepareUploadsResult =
  | { ok: true; submissionId: string; uploads: PreparedUpload[] }
  | { ok: false; error: string };

export type PrepareUploadsAction = (request: PrepareUploadsRequest) => Promise<PrepareUploadsResult>;

/** A photo the browser uploaded and now claims for the submission. Verified server-side before use. */
export type MediaClaim = { slotId: string | null; path: string };

export const UPLOAD_FAILED_MESSAGE =
  "We couldn't upload your photos. Your answers and photos are still here — check your connection and try again.";

export const SEND_FAILED_MESSAGE = "We couldn't send this. Your answers and photos are still here — try again.";

export const MEDIA_VERIFY_FAILED_MESSAGE =
  "One of the photos couldn't be verified. Please add it again and resubmit.";
