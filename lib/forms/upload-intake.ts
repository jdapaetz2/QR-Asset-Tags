import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { SUBMISSIONS_BUCKET, scopedSubmissionBucket, type ScopedSubmissionBucket } from "@/lib/forms/media-verify";

/**
 * Service-role reach for PUBLIC submission media — and nothing else.
 *
 * Anonymous visitors cannot write to the private `submissions` bucket (migration 0037), cannot read it, and cannot
 * delete from it, so public intake needs a trusted handle to: mint path-bound signed upload URLs, list and read the
 * first bytes of the objects a renter just uploaded, upload the no-JavaScript fallback's files, and delete objects
 * that fail verification or were superseded by a retry.
 *
 * The handle is confined to ONE `org/{uuid}/asset/{uuid}/submission/{uuid}` prefix (every path is re-checked in
 * lib/forms/media-verify.ts). Callers must first run the honeypot, the shared rate limiter and live public-tag
 * resolution, and build the prefix from the resolved organization and asset — never from client input.
 *
 * Audited in docs/SECURITY_MODEL.md (service-role inventory); allowlisted in lib/security/service-role.test.ts and
 * scripts/verify-production-config.mjs.
 */
export function publicSubmissionBucket(prefix: string): ScopedSubmissionBucket {
  return scopedSubmissionBucket(createAdminClient().storage.from(SUBMISSIONS_BUCKET), prefix);
}
