import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { HONEYPOT_FIELD } from "@/lib/forms/validate";
import {
  INSPECTION_MAX_FILES,
  INSPECTION_MAX_TOTAL_BYTES,
  mediaObjectName,
  submissionPathPrefix,
  validateInspectionFiles,
} from "@/lib/forms/media";
import { cleanupUploadedMedia } from "@/lib/forms/cleanup";
import { resolveSubmissionId } from "@/lib/forms/submit";
import { readMediaClaims, removeUnclaimedObjects, verifyClaimedMedia } from "@/lib/forms/media-verify";
import { publicSubmissionBucket } from "@/lib/forms/upload-intake";
import { MEDIA_VERIFY_FAILED_MESSAGE } from "@/lib/forms/upload-contract";
import { checkRateLimit, hashToken } from "@/lib/ratelimit/limiter";
import { RATE_LIMITED_MESSAGE } from "@/lib/ratelimit/policy";
import { logAbuseEvent } from "@/lib/ratelimit/log";
import { scheduleSubmissionNotification } from "@/lib/notifications/schedule";
import { submissionReference } from "@/lib/submissions/inbox";
import { revalidateSubmissionSurfaces } from "@/lib/submissions/revalidate";
import { resolveReturnTemplate } from "@/lib/inspections/resolve";
import { getAssetReturnTemplate } from "@/lib/inspections/org-templates-data";
import {
  buildAnswers,
  deriveFlags,
  evaluateInspection,
  parseAnswerValues,
  readOmissionAck,
  resolvePhotoEvidence,
  visiblePhotoSlots,
} from "@/lib/inspections/validate";
import { DAMAGE_PHOTOS_SLOT_ID } from "@/lib/inspections/templates";
import { buildReturnSubmissionData } from "@/lib/inspections/snapshot";
import { checkClaimSlots, groupVerifiedPhotos, TOTAL_TOO_LARGE_MESSAGE } from "@/lib/inspections/claimed-photos";
import type { PhotoAnswer } from "@/lib/inspections/types";
import type { PublicFormState } from "@/lib/forms/submit";

/**
 * Server-authoritative core for the guided return inspection (Return Inspection V2, Phase 1A). The
 * browser may send ONLY contact fields, `answer:<fieldId>` values, photos (as `photo:<slotId>` files, or as
 * `media_paths` claims for photos already uploaded directly — lib/forms/upload-contract.ts), and the
 * honeypot. Everything else — organization_id, asset_id, form_type, status, the template + its
 * version + snapshot, the canonical flags, and the rental session — is derived server-side (the
 * rental session by the DB trigger). The insert uses the anon client; submission media goes through the
 * prefix-scoped service-role handle (lib/forms/upload-intake.ts).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readStr(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function submitReturnInspectionCore(
  shortCode: string,
  formData: FormData
): Promise<PublicFormState> {
  const thanks = `/forms/${shortCode}/return/thanks`;
  const correlationId = randomUUID();

  // Honeypot: silently accept a bot without saving.
  if (readStr(formData, HONEYPOT_FIELD)) redirect(thanks);

  const hasPhotoFiles = [...formData.entries()].some(
    ([key, value]) => key.startsWith("photo:") && typeof value !== "string" && value.size > 0
  );
  const claimsRead = readMediaClaims(formData, INSPECTION_MAX_FILES);
  if (claimsRead.kind === "invalid" || (claimsRead.kind === "claims" && hasPhotoFiles)) {
    return { error: MEDIA_VERIFY_FAILED_MESSAGE };
  }
  const claims = claimsRead.kind === "claims" ? claimsRead.claims : null;

  // Preflight rate limit BEFORE resolve/upload/insert. The 'return' rules are media-agnostic, so a cheap
  // "any photo attached" probe is enough for the log; no template resolution is needed to decide. A direct-upload
  // finalize spent its token when its upload URLs were issued (lib/forms/upload-prepare.ts).
  let shortCodeHash: string;
  if (claims) {
    shortCodeHash = hashToken(shortCode, serverEnv.scanIpHashSalt);
  } else {
    const rl = await checkRateLimit({ action: "return", shortCode, hasMedia: hasPhotoFiles, correlationId });
    if (!rl.allowed) {
      logAbuseEvent({ action: "return", correlationId, shortCodeHash: rl.shortCodeHash, limiter: "limited" });
      return { error: RATE_LIMITED_MESSAGE };
    }
    shortCodeHash = rl.shortCodeHash;
  }

  const supabase = createPublicClient();
  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) return { error: "This form is no longer available." };

  // Template resolved server-side (never client input). A published custom org template assigned to the
  // asset wins (loaded via the SECURITY DEFINER RPC — published-only, org-scoped); otherwise fall back to
  // the code resolver on the asset's system key + category. The public path never reads the category
  // defaults or the inspection_templates table directly.
  const custom = resolved.returnInspectionTemplateId
    ? await getAssetReturnTemplate(supabase, resolved.assetId)
    : null;
  const template =
    custom?.definition ??
    resolveReturnTemplate({
      assignmentKey: resolved.returnInspectionTemplateKey,
      category: resolved.category,
    });

  // Contact (optional) + answers.
  const name = readStr(formData, "name");
  const email = readStr(formData, "email");
  const phone = readStr(formData, "phone");
  if (email && !EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const values = parseAnswerValues(template, (key) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : null;
  });
  const answersError = evaluateInspection(template, values);
  if (answersError) return { error: answersError };

  const slots = visiblePhotoSlots(template, values);

  // submissionId is the client idempotency token when present (rapid resubmit → same PK, not a dupe); direct
  // uploads live under its prefix.
  const submissionId = resolveSubmissionId(formData);
  const bucket = publicSubmissionBucket(submissionPathPrefix(resolved.organizationId, resolved.assetId, submissionId));

  let mediaPaths: string[] = [];
  let totalBytes = 0;
  let photos: Record<string, PhotoAnswer[]> = {};
  if (claims) {
    // Claims only for VISIBLE slots, within each slot's maximum; then every object is verified.
    const slotError = checkClaimSlots(slots, claims);
    if (slotError) return { error: slotError };
    const verified = await verifyClaimedMedia(bucket, claims, {
      maxFiles: INSPECTION_MAX_FILES,
      maxTotalBytes: INSPECTION_MAX_TOTAL_BYTES,
    });
    if (!verified.ok) {
      logAbuseEvent({
        action: "return", correlationId, shortCodeHash, limiter: "allowed",
        fileCount: claims.length, failure: `verify_${verified.reason}`,
      });
      return { error: verified.reason === "total" ? TOTAL_TOO_LARGE_MESSAGE : MEDIA_VERIFY_FAILED_MESSAGE };
    }
    ({ photos, mediaPaths } = groupVerifiedPhotos(slots, verified.media));
    totalBytes = verified.totalBytes;
  } else {
    // Collect files for VISIBLE photo slots only (files for hidden slots are ignored).
    const filesBySlot = new Map<string, File[]>();
    const allFiles: File[] = [];
    for (const slot of slots) {
      const entries = formData
        .getAll(`photo:${slot.id}`)
        .filter((e): e is File => typeof e !== "string" && e.size > 0);
      filesBySlot.set(slot.id, entries);
      allFiles.push(...entries);
    }

    const mediaError = validateInspectionFiles(
      allFiles.map((f) => ({ type: f.type, size: f.size, name: f.name }))
    );
    if (mediaError) return { error: mediaError };

    // Per-slot maximum only (Phase 3C.1.1): NO photo is a hard prerequisite — minimums are not enforced.
    // Missing photos are handled by the soft evidence rule below; the global media limits still apply.
    for (const slot of slots) {
      const count = filesBySlot.get(slot.id)?.length ?? 0;
      const max = slot.photo?.maxPhotos ?? 6;
      if (count > max) return { error: `"${slot.label}" allows at most ${max} photos.` };
    }

    // Upload each slot's files; record flat paths (media_urls) + per-slot metadata (answers.photos).
    for (const slot of slots) {
      const files = filesBySlot.get(slot.id) ?? [];
      const slotPhotos: PhotoAnswer[] = [];
      for (const file of files) {
        const path = `${bucket.prefix}/${mediaObjectName(randomUUID(), file.type)}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        totalBytes += bytes.byteLength;
        if (!(await bucket.upload(path, bytes, file.type))) {
          await cleanupUploadedMedia(bucket, mediaPaths, {
            action: "return", correlationId, shortCodeHash, failure: "upload",
          });
          return { error: "Could not upload your files. Please try again." };
        }
        mediaPaths.push(path);
        slotPhotos.push({ path, caption: slot.label });
      }
      if (slotPhotos.length > 0) photos[slot.id] = slotPhotos;
    }
  }

  const flags = deriveFlags(template, values);
  // Soft photo evidence (Phase 3C.1.1): the server counts photos from the VALIDATED uploads and requires an
  // explicit omission acknowledgement when damage has no photo OR nothing was attached at all.
  const totalPhotoCount = Object.values(photos).reduce((n, list) => n + list.length, 0);
  const evidence = resolvePhotoEvidence({
    damage: flags.damage_observed === "yes",
    damagePhotoCount: photos[DAMAGE_PHOTOS_SLOT_ID]?.length ?? 0,
    totalPhotoCount,
    hasPhotoSlots: slots.length > 0,
    acknowledged: readOmissionAck(formData),
  });
  if (evidence.error) {
    // Nothing is committed. Files uploaded by THIS request are removed (they were previously left orphaned here);
    // direct uploads stay for the renter's acknowledged resubmit with the same claims.
    if (!claims) {
      await cleanupUploadedMedia(bucket, mediaPaths, {
        action: "return", correlationId, shortCodeHash, failure: "evidence",
      });
    }
    return { error: evidence.error };
  }
  flags.damage_photos_missing = evidence.damagePhotosMissing;
  flags.condition_photos_missing = evidence.conditionPhotosMissing;

  // Visible photo slots that received no upload (server-computed) — admin sees which angles are missing.
  const missingSlots = slots
    .filter((slot) => (photos[slot.id]?.length ?? 0) === 0)
    .map((slot) => slot.id);

  const data = buildReturnSubmissionData({ template, answers: buildAnswers(values, photos), flags });
  if (missingSlots.length > 0) data.missing_recommended_photo_slots = missingSlots;
  if (evidence.damagePhotosMissing || evidence.conditionPhotosMissing) {
    data.photo_omission_acknowledged = true;
  }

  // id + created_at set app-side so the reference is byte-identical to the admin's (anon can't read back).
  const createdAt = new Date().toISOString();
  const { error: insertError } = await supabase.from("form_submissions").insert({
    id: submissionId,
    created_at: createdAt,
    organization_id: resolved.organizationId,
    asset_id: resolved.assetId,
    form_type: "return_checklist",
    status: "new",
    submitted_by_name: name,
    submitted_by_email: email,
    submitted_by_phone: phone,
    submission_data_json: data,
    media_urls: mediaPaths,
    inspection_template_key: template.key,
    inspection_template_version: template.version,
    // rental_session_id is set authoritatively by the BEFORE INSERT trigger (migration 0024).
  });
  const reference = submissionReference(submissionId, createdAt);

  if (insertError) {
    // Duplicate submit (same idempotency token) → PK conflict: clean THIS call's uploaded files (the original
    // inspection + media are untouched) and finish successfully. Direct claims may be the original's media.
    if (insertError.code === "23505") {
      if (!claims) {
        await cleanupUploadedMedia(bucket, mediaPaths, {
          action: "return", correlationId, shortCodeHash, failure: "duplicate",
        });
      }
      redirect(`${thanks}?ref=${reference}`);
    }
    // Real insert failure → clean up the just-uploaded files so they are not orphaned.
    if (claims) {
      logAbuseEvent({
        action: "return", correlationId, shortCodeHash, limiter: "allowed", fileCount: claims.length, failure: "insert",
      });
    } else {
      await cleanupUploadedMedia(bucket, mediaPaths, {
        action: "return", correlationId, shortCodeHash, failure: "insert",
      });
    }
    return { error: "Could not submit the inspection. Please try again." };
  }

  logAbuseEvent({
    action: "return", correlationId, shortCodeHash,
    limiter: "allowed", fileCount: mediaPaths.length, totalBytes, cleanup: "none",
  });

  // Committed: objects an earlier attempt left under this prefix are not referenced by the row.
  if (claims) await removeUnclaimedObjects(bucket, mediaPaths);

  // Best-effort email alert, after the response (Phase C6) — same reasoning as lib/forms/submit.ts:
  // the inspection row is committed above and is the system of record.
  // Engineering Phase D1: identifiers only — the notifier builds the email from the committed row.
  scheduleSubmissionNotification({
    organizationId: resolved.organizationId,
    assetId: resolved.assetId,
    submissionId,
    reference,
    formType: "return_checklist",
  });

  // A completed return checklist is a `status='new'` submission exactly like a damage or support report,
  // so the authenticated surfaces must be marked stale here too (Phase C6.1). This call was missing: the
  // row committed, the renter saw their confirmation, and the admin's nav badge and inbox went on showing
  // the old count until a full browser reload — which is precisely the reload this helper exists to make
  // unnecessary. Mirrors lib/forms/submit.ts.
  //
  // Placement is deliberate: after a SUCCESSFUL insert only (every failure path above has already
  // returned or redirected), and independent of the notification — `scheduleSubmissionNotification`
  // merely registers an `after()` callback and returns, so neither this nor the redirect waits on email.
  revalidateSubmissionSurfaces();

  redirect(`${thanks}?ref=${reference}`);
}
