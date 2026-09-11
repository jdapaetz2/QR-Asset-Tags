import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { HONEYPOT_FIELD, IDEMPOTENCY_FIELD } from "@/lib/forms/validate";
import {
  MAX_FILES,
  mediaObjectName,
  submissionPathPrefix,
  validateUploadFiles,
} from "@/lib/forms/media";
import { cleanupUploadedMedia } from "@/lib/forms/cleanup";
import { readMediaClaims, removeUnclaimedObjects, verifyClaimedMedia } from "@/lib/forms/media-verify";
import { publicSubmissionBucket } from "@/lib/forms/upload-intake";
import { MEDIA_VERIFY_FAILED_MESSAGE } from "@/lib/forms/upload-contract";
import { checkRateLimit, hashToken } from "@/lib/ratelimit/limiter";
import { RATE_LIMITED_MESSAGE, type RateLimitAction } from "@/lib/ratelimit/policy";
import { logAbuseEvent } from "@/lib/ratelimit/log";
import { scheduleSubmissionNotification } from "@/lib/notifications/schedule";
import { submissionReference } from "@/lib/submissions/inbox";
import { revalidateSubmissionSurfaces } from "@/lib/submissions/revalidate";
import { confirmationUrl } from "@/lib/public/confirmation";

/**
 * Shared server-side core for public damage / support submissions. organization_id, asset_id, form_type and status
 * are always derived server-side — never from form input — and RLS re-checks the asset is public + org-matched on
 * insert, which still uses the anon client.
 *
 * Phase A4: a shared-store rate limit runs BEFORE any resolve/upload/insert (no storage or DB cost on a limited
 * request, no asset-existence leak); uploaded media is cleaned up on any finalization failure; and a client
 * idempotency token makes a rapid double-submit a no-op instead of a duplicate row + files.
 *
 * Photos arrive one of two ways (lib/forms/upload-contract.ts):
 *   - DIRECT (JavaScript): the browser already uploaded them through signed URLs issued by
 *     lib/forms/upload-prepare.ts, which spent this submission's rate-limit token. The form carries `media_paths`
 *     claims; every claimed object is verified under this submission's own prefix before the row references it.
 *   - FILES (no JavaScript): the files are in the request body and are uploaded here, after the limiter, through
 *     the prefix-scoped service-role handle (anon can no longer write the bucket — migration 0037).
 */

export type PublicFormState = { error?: string };

export type SubmittedBy = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type PublicFormConfig = {
  formType: "damage_report" | "support_request" | "return_checklist";
  thanksSlug: string;
  fieldError: string | null;
  submittedBy: SubmittedBy;
  dataJson: Record<string, unknown>;
  /**
   * Engineering Phase D2 — whether the validated answers map to Immediate attention, so the confirmation page shows
   * a call-now block. Display-only: it travels as `&call=1` and unlocks nothing.
   */
  callNow?: boolean;
};

export const MEDIA_FIELD = "media";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type UploadedFile = {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

/** Trimmed string form value, or null when empty/absent. */
export function readString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readFiles(formData: FormData): UploadedFile[] {
  return formData
    .getAll(MEDIA_FIELD)
    .filter(
      (entry): entry is File => typeof entry !== "string" && entry.size > 0
    );
}

/** A client-minted idempotency token (UUID), or a fresh server id when absent/invalid (non-JS fallback). */
export function resolveSubmissionId(formData: FormData): string {
  const token = readString(formData, IDEMPOTENCY_FIELD);
  return token && UUID_RE.test(token) ? token : randomUUID();
}

/** Map the form type to a rate-limit action bucket. */
function rateActionFor(formType: PublicFormConfig["formType"]): RateLimitAction {
  return formType === "return_checklist" ? "return" : "damage_support";
}

export async function submitPublicForm(
  shortCode: string,
  formData: FormData,
  config: PublicFormConfig
): Promise<PublicFormState> {
  const thanks = `/forms/${shortCode}/${config.thanksSlug}/thanks`;
  const correlationId = randomUUID();

  // Honeypot: a filled hidden field means a bot. Silently accept without saving.
  if (readString(formData, HONEYPOT_FIELD)) {
    redirect(thanks);
  }

  const files = readFiles(formData);
  const claimsRead = readMediaClaims(formData, MAX_FILES);
  const action = rateActionFor(config.formType);
  // One shape per request: malformed claims, or claims alongside files, are refused before any work.
  if (claimsRead.kind === "invalid" || (claimsRead.kind === "claims" && files.length > 0)) {
    return { error: MEDIA_VERIFY_FAILED_MESSAGE };
  }
  const claims = claimsRead.kind === "claims" ? claimsRead.claims : null;

  // Preflight rate limit BEFORE resolve/upload/insert: a limited request costs no storage/DB and reveals nothing
  // about the asset (same message whether or not it exists). A direct-upload finalize spent its token when its
  // upload URLs were issued; anon cannot create objects any other way, so verified objects prove that preflight.
  let shortCodeHash: string;
  if (claims) {
    shortCodeHash = hashToken(shortCode, serverEnv.scanIpHashSalt);
  } else {
    const rl = await checkRateLimit({
      action,
      shortCode,
      hasMedia: files.length > 0,
      correlationId,
    });
    if (!rl.allowed) {
      logAbuseEvent({
        action,
        correlationId,
        shortCodeHash: rl.shortCodeHash,
        limiter: "limited",
        fileCount: files.length,
      });
      return { error: RATE_LIMITED_MESSAGE };
    }
    shortCodeHash = rl.shortCodeHash;
  }

  const supabase = createPublicClient();

  // Same public eligibility as /t/[shortCode]; blocks private/draft/disabled/missing.
  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) {
    return { error: "This form is no longer available." };
  }

  if (config.fieldError) return { error: config.fieldError };

  // Server-built, org/asset-scoped storage prefix. The submission id is the client idempotency token when present,
  // so a rapid resubmit lands on the same row (PK) rather than a dupe — and direct uploads live under it.
  const submissionId = resolveSubmissionId(formData);
  const bucket = publicSubmissionBucket(
    submissionPathPrefix(resolved.organizationId, resolved.assetId, submissionId)
  );

  let mediaPaths: string[] = [];
  let totalBytes = 0;
  if (claims) {
    const verified = await verifyClaimedMedia(bucket, claims, { maxFiles: MAX_FILES, maxTotalBytes: null });
    if (!verified.ok) {
      logAbuseEvent({
        action,
        correlationId,
        shortCodeHash,
        limiter: "allowed",
        fileCount: claims.length,
        failure: `verify_${verified.reason}`,
      });
      return { error: MEDIA_VERIFY_FAILED_MESSAGE };
    }
    mediaPaths = verified.media.map((item) => item.path);
    totalBytes = verified.totalBytes;
  } else {
    const fileError = validateUploadFiles(
      files.map((f) => ({ type: f.type, size: f.size }))
    );
    if (fileError) return { error: fileError };

    for (const file of files) {
      const path = `${bucket.prefix}/${mediaObjectName(randomUUID(), file.type)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      totalBytes += bytes.byteLength;
      if (!(await bucket.upload(path, bytes, file.type))) {
        // Clean up this request's already-uploaded objects before bailing (best effort).
        await cleanupUploadedMedia(bucket, mediaPaths, {
          action,
          correlationId,
          shortCodeHash,
          failure: "upload",
        });
        return { error: "Could not upload your files. Please try again." };
      }
      mediaPaths.push(path);
    }
  }

  // Use the id + created_at we set here as the row's own values so we can build the
  // ONE canonical reference (SUB-YYYY-XXXXXX) without selecting the row back (anon
  // can't read submissions). Because the admin reads this exact stored created_at, the
  // renter's reference is byte-identical to the one shown in the inbox / detail / CSV /
  // email. Setting created_at is allowed: the anon insert grant is table-level and the
  // insert policy only checks the asset/org linkage.
  const createdAt = new Date().toISOString();
  const { error: insertError } = await supabase.from("form_submissions").insert({
    id: submissionId,
    created_at: createdAt,
    organization_id: resolved.organizationId,
    asset_id: resolved.assetId,
    form_type: config.formType,
    status: "new",
    submitted_by_name: config.submittedBy.name,
    submitted_by_email: config.submittedBy.email,
    submitted_by_phone: config.submittedBy.phone,
    submission_data_json: config.dataJson,
    media_urls: mediaPaths,
  });

  const reference = submissionReference(submissionId, createdAt);

  if (insertError) {
    // Duplicate submit (same idempotency token already inserted) → PK conflict. Not an error. Uploaded files of
    // THIS call are new objects and are cleaned up; directly uploaded claims may be the committed submission's own
    // media, so nothing is deleted for them.
    if (insertError.code === "23505") {
      if (!claims) {
        await cleanupUploadedMedia(bucket, mediaPaths, {
          action,
          correlationId,
          shortCodeHash,
          failure: "duplicate",
        });
      }
      redirect(confirmationUrl(thanks, reference, config.callNow === true));
    }
    // Real insert failure → clean up the just-uploaded files so they are not orphaned. Direct uploads stay for a
    // retry with the same claims; abandoned ones are swept by the orphan tool (no row, older than 48 h).
    if (claims) {
      logAbuseEvent({ action, correlationId, shortCodeHash, limiter: "allowed", fileCount: claims.length, failure: "insert" });
    } else {
      await cleanupUploadedMedia(bucket, mediaPaths, {
        action,
        correlationId,
        shortCodeHash,
        failure: "insert",
      });
    }
    return { error: "Could not submit the form. Please try again." };
  }

  logAbuseEvent({
    action,
    correlationId,
    shortCodeHash,
    limiter: "allowed",
    fileCount: mediaPaths.length,
    totalBytes,
    cleanup: "none",
  });

  // The row is committed and references exactly `mediaPaths`: objects left under this submission's prefix by an
  // earlier attempt (a retried upload) are no one's evidence and are removed.
  if (claims) await removeUnclaimedObjects(bucket, mediaPaths);

  // Best-effort email alert, scheduled to run AFTER the response (Phase C6). The row above is already
  // committed and IS the system of record; the email is an alert about a record that already exists.
  // Measured live on Production, the provider call was 178.7 ms median on the renter's critical path,
  // with a 15 s worst case sitting on their success path. It never blocked the submission and it still
  // does not; it no longer delays the confirmation either. See lib/notifications/schedule.ts.
  // Engineering Phase D1: identifiers only — the notifier builds the email from the committed row.
  scheduleSubmissionNotification({
    organizationId: resolved.organizationId,
    assetId: resolved.assetId,
    submissionId,
    reference,
    formType: config.formType,
  });

  // A new public submission is `status='new'`, so mark the authenticated submission surfaces stale — the next
  // admin navigation recomputes a fresh nav badge / inbox count without a manual refresh (no polling, no loop).
  revalidateSubmissionSurfaces();

  // Pass the canonical reference to the thanks page for a display-only confirmation
  // number — the same string the rental company sees in the admin inbox. Anon cannot
  // read submissions back, so this exposes nothing (and is less revealing than the id).
  redirect(confirmationUrl(thanks, reference, config.callNow === true));
}
