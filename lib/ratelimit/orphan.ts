/**
 * Phase A4 — pure helpers for the operator orphan-media tool (scripts/cleanup-orphan-media.mjs). Kept
 * pure/dependency-free so the risky "is this safe to delete?" logic is unit-tested. The rule: only an
 * object whose owning `form_submissions` row never materialized AND that is older than a conservative
 * threshold is a deletion candidate — this honors the "never lose the record" invariant in
 * docs/STORAGE_MEDIA_LIFECYCLE.md (only bytes with no record are removed).
 */

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** Matches the server-built submissions path: org/{uuid}/asset/{uuid}/submission/{uuid}/{file}. */
export const SUBMISSION_OBJECT_RE = new RegExp(
  `^org/(${UUID})/asset/(${UUID})/submission/(${UUID})/[^/]+$`
);

/** The prefix (no filename) for a submission's objects, used to enumerate/group. */
export const SUBMISSION_PREFIX_RE = new RegExp(
  `^org/(${UUID})/asset/(${UUID})/submission/(${UUID})$`
);

export type SubmissionObjectRef = {
  organizationId: string;
  assetId: string;
  submissionId: string;
};

/** Parse a full object path into its org/asset/submission ids, or null if it is not a submissions object. */
export function parseSubmissionObjectPath(path: string): SubmissionObjectRef | null {
  const m = SUBMISSION_OBJECT_RE.exec(path);
  if (!m) return null;
  return { organizationId: m[1], assetId: m[2], submissionId: m[3] };
}

/** Parse a submission PREFIX (org/.../submission/{id}) into ids, or null. */
export function parseSubmissionPrefix(prefix: string): SubmissionObjectRef | null {
  const m = SUBMISSION_PREFIX_RE.exec(prefix);
  if (!m) return null;
  return { organizationId: m[1], assetId: m[2], submissionId: m[3] };
}

/**
 * A submission's objects are an orphan-deletion candidate iff (a) no `form_submissions` row exists for
 * that id, AND (b) the newest object is older than the age threshold. Conservative on purpose: if a row
 * exists we never touch it; if the age is unknown/recent we skip it (avoids racing an in-flight upload).
 */
export function isOrphanCandidate(input: {
  hasSubmissionRow: boolean;
  newestObjectAgeMs: number | null;
  thresholdMs: number;
}): boolean {
  if (input.hasSubmissionRow) return false;
  if (input.newestObjectAgeMs === null) return false;
  return input.newestObjectAgeMs >= input.thresholdMs;
}
