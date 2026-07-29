import type { SupabaseClient } from "@supabase/supabase-js";

import { logAbuseEvent } from "@/lib/ratelimit/log";

/**
 * Phase A4 — best-effort cleanup of media uploaded during THIS request when finalization fails. Public
 * upload cores upload to the private `submissions` bucket before the DB insert; if the insert (or a
 * mid-loop upload) fails, the just-uploaded objects would otherwise be orphaned. This deletes ONLY the
 * paths passed in — objects uploaded this request — so it can never remove pre-existing evidence.
 *
 * Mirrors the staff cleanupMedia helper (lib/inspections/outbound-submit.ts) but returns a classified
 * result for structured logging, and never throws (a cleanup failure must not mask the original error or
 * leak anything).
 */

export const SUBMISSIONS_BUCKET = "submissions";

export type CleanupOutcome = "clean" | "partial" | "failed" | "none";

export async function cleanupUploadedMedia(
  supabase: SupabaseClient,
  paths: string[],
  ctx: { action: string; correlationId: string; shortCodeHash: string; failure: string }
): Promise<CleanupOutcome> {
  if (paths.length === 0) {
    return "none";
  }
  let outcome: CleanupOutcome;
  try {
    const { data, error } = await supabase.storage.from(SUBMISSIONS_BUCKET).remove(paths);
    if (error) {
      outcome = "failed";
    } else {
      const removed = Array.isArray(data) ? data.length : 0;
      outcome = removed >= paths.length ? "clean" : "partial";
    }
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
