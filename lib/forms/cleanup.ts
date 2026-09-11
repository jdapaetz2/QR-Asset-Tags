import type { ScopedSubmissionBucket } from "@/lib/forms/media-verify";
import { logAbuseEvent } from "@/lib/ratelimit/log";

/**
 * Phase A4 — best-effort cleanup of media uploaded during THIS request when finalization fails. The no-JavaScript
 * upload path writes to the private `submissions` bucket before the DB insert; if the insert (or a mid-loop upload)
 * fails, the just-uploaded objects would otherwise be orphaned. This deletes ONLY the paths passed in — objects
 * uploaded this request — so it can never remove pre-existing evidence.
 *
 * It removes through the submission-scoped bucket handle (lib/forms/media-verify.ts). Before the direct-upload
 * change this used the anon client, which has no DELETE policy on `submissions`, so cleanup silently removed
 * nothing. Returns a classified result for structured logging and never throws.
 */

export const SUBMISSIONS_BUCKET = "submissions";

export type CleanupOutcome = "clean" | "partial" | "failed" | "none";

export async function cleanupUploadedMedia(
  bucket: Pick<ScopedSubmissionBucket, "remove">,
  paths: string[],
  ctx: { action: string; correlationId: string; shortCodeHash: string; failure: string }
): Promise<CleanupOutcome> {
  if (paths.length === 0) {
    return "none";
  }
  let outcome: CleanupOutcome;
  try {
    const { removed, failed } = await bucket.remove(paths);
    outcome = failed ? "failed" : removed >= paths.length ? "clean" : "partial";
  } catch {
    outcome = "failed";
  }
  logAbuseEvent({
    action: ctx.action,
    correlationId: ctx.correlationId,
    shortCodeHash: ctx.shortCodeHash,
    limiter: "allowed",
    fileCount: paths.length,
    cleanup: outcome,
    failure: ctx.failure,
  });
  return outcome;
}
