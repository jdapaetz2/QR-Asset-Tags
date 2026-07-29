import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { HONEYPOT_FIELD, IDEMPOTENCY_FIELD } from "@/lib/forms/validate";
import {
  mediaObjectName,
  submissionPathPrefix,
  validateUploadFiles,
} from "@/lib/forms/media";
import { cleanupUploadedMedia } from "@/lib/forms/cleanup";
import { checkRateLimit } from "@/lib/ratelimit/limiter";
import { RATE_LIMITED_MESSAGE, type RateLimitAction } from "@/lib/ratelimit/policy";
import { logAbuseEvent } from "@/lib/ratelimit/log";
import { notifySubmission } from "@/lib/notifications/notify";
import { submissionReference } from "@/lib/submissions/inbox";
import { revalidateSubmissionSurfaces } from "@/lib/submissions/revalidate";

/**
 * Shared server-side core for all public form submissions (damage / support /
 * return). organization_id, asset_id, form_type and status are always derived
 * server-side — never from form input — and RLS re-checks the asset is public +
 * org-matched on insert. Uses the anon client only (no service-role). Imported
 * by the "use server" actions; not a server action itself.
 *
 * Phase A4: a shared-store rate limit runs BEFORE any resolve/upload/insert (no storage or DB cost on a
 * limited request, no asset-existence leak); uploaded media is cleaned up on any finalization failure;
 * and a client idempotency token makes a rapid double-submit a no-op instead of a duplicate row + files.
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
};

const SUBMISSIONS_BUCKET = "submissions";
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
  const action = rateActionFor(config.formType);

  // Preflight rate limit BEFORE resolve/upload/insert: a limited request costs no storage/DB and reveals
  // nothing about the asset (same message whether or not it exists).
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

  const supabase = createPublicClient();

  // Same public eligibility as /t/[shortCode]; blocks private/draft/disabled/missing.
  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) {
    return { error: "This form is no longer available." };
  }

  if (config.fieldError) return { error: config.fieldError };

  const fileError = validateUploadFiles(
    files.map((f) => ({ type: f.type, size: f.size }))
  );
  if (fileError) return { error: fileError };

  // Server-built, org/asset-scoped storage path (matches the anon-insert policy). The submission id is a
  // client idempotency token when present, so a rapid resubmit lands on the same row (PK) rather than a dupe.
  const submissionId = resolveSubmissionId(formData);
  const prefix = submissionPathPrefix(
    resolved.organizationId,
    resolved.assetId,
    submissionId
  );

  const mediaPaths: string[] = [];
  let totalBytes = 0;
  for (const file of files) {
    const path = `${prefix}/${mediaObjectName(randomUUID(), file.type)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    totalBytes += bytes.byteLength;
    const { error } = await supabase.storage
      .from(SUBMISSIONS_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) {
      // Clean up this request's already-uploaded objects before bailing (best effort).
      await cleanupUploadedMedia(supabase, mediaPaths, {
        action,
        correlationId,
        shortCodeHash: rl.shortCodeHash,
        failure: "upload",
      });
      return { error: "Could not upload your files. Please try again." };
    }
    mediaPaths.push(path);
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
    // Duplicate submit (same idempotency token already inserted) → PK conflict. Not an error: clean up
    // THIS call's re-uploaded objects (the original submission + its media are untouched) and finish.
    if (insertError.code === "23505") {
      await cleanupUploadedMedia(supabase, mediaPaths, {
        action,
        correlationId,
        shortCodeHash: rl.shortCodeHash,
        failure: "duplicate",
      });
      redirect(`${thanks}?ref=${reference}`);
    }
    // Real insert failure → clean up the just-uploaded objects so they are not orphaned.
    await cleanupUploadedMedia(supabase, mediaPaths, {
      action,
      correlationId,
      shortCodeHash: rl.shortCodeHash,
      failure: "insert",
    });
    return { error: "Could not submit the form. Please try again." };
  }

  logAbuseEvent({
    action,
    correlationId,
    shortCodeHash: rl.shortCodeHash,
    limiter: "allowed",
    fileCount: files.length,
    totalBytes,
    cleanup: "none",
  });

  // Best-effort email alert. notifySubmission swallows its own errors, so a notification failure can
  // never block the submission OR delete its committed media (the media stays regardless).
  await notifySubmission({
    organizationId: resolved.organizationId,
    formType: config.formType,
    assetId: resolved.assetId,
    submittedBy: config.submittedBy,
    submissionId,
    reference,
  });

  // A new public submission is `status='new'`, so mark the authenticated submission surfaces stale — the next
  // admin navigation recomputes a fresh nav badge / inbox count without a manual refresh (no polling, no loop).
  revalidateSubmissionSurfaces();

  // Pass the canonical reference to the thanks page for a display-only confirmation
  // number — the same string the rental company sees in the admin inbox. Anon cannot
  // read submissions back, so this exposes nothing (and is less revealing than the id).
  redirect(`${thanks}?ref=${reference}`);
}
