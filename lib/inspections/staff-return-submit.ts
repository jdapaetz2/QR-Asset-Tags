import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import {
  INSPECTION_MAX_FILES,
  INSPECTION_MAX_TOTAL_BYTES,
  mediaObjectName,
  submissionPathPrefix,
  validateInspectionFiles,
} from "@/lib/forms/media";
import { resolveSubmissionId } from "@/lib/forms/submit";
import {
  SUBMISSIONS_BUCKET,
  readMediaClaims,
  removeUnclaimedObjects,
  scopedSubmissionBucket,
  verifyClaimedMedia,
} from "@/lib/forms/media-verify";
import { MEDIA_VERIFY_FAILED_MESSAGE } from "@/lib/forms/upload-contract";
import { resolveStaffReturnTemplate } from "@/lib/inspections/staff-return-templates";
import { staffReturnStatus } from "@/lib/submissions/returns";
import { revalidateSubmissionSurfaces } from "@/lib/submissions/revalidate";
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
 * Server-authoritative core for the STAFF return inspection (Phase 3A.1). Runs as the AUTHENTICATED staff
 * user (RLS-scoped client) and, on success, COMPLETES the physical return atomically via the
 * `complete_staff_return` RPC: it inserts the staff return, closes the active rental session, and clears the
 * asset pointer in one transaction. Staff identity is derived from the session (never client input), there
 * is no renter contact/acknowledgement, and no separate "Mark returned & resolve" step is needed. Staged
 * safe flow: validate answers → verify claimed photos (or validate + upload files) → RPC. Media uploaded by
 * this request are cleaned up if the RPC does not complete. Idempotent: a replay returns the existing completion
 * instead of a duplicate.
 *
 * Photos uploaded directly to storage (lib/forms/upload-contract.ts) are claimed via `media_paths` and verified
 * with the staff user's own session, which the authenticated org storage policies authorize.
 */

export async function submitStaffReturnInspectionCore(
  shortCode: string,
  formData: FormData
): Promise<PublicFormState> {
  // Auth + own-org asset (cross-org/unknown short code → notFound via the guard).
  const { profile, organizationId, asset } = await requireStaffAssetByShortCode(shortCode);

  const expectedSessionId = asset.active_rental_session_id;
  if (!expectedSessionId) {
    return { error: "This asset has no active rental session to return." };
  }

  // Staff return template resolved server-side (system template, attestation stripped). Never client input.
  const template = resolveStaffReturnTemplate({
    assignmentKey: asset.return_inspection_template_key,
    category: asset.category,
  });

  const values = parseAnswerValues(template, (key) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : null;
  });
  const answersError = evaluateInspection(template, values);
  if (answersError) return { error: answersError };

  // Collect files for VISIBLE photo slots only.
  const slots = visiblePhotoSlots(template, values);
  const filesBySlot = new Map<string, File[]>();
  const allFiles: File[] = [];
  for (const slot of slots) {
    const entries = formData
      .getAll(`photo:${slot.id}`)
      .filter((e): e is File => typeof e !== "string" && e.size > 0);
    filesBySlot.set(slot.id, entries);
    allFiles.push(...entries);
  }

  const claimsRead = readMediaClaims(formData, INSPECTION_MAX_FILES);
  if (claimsRead.kind === "invalid" || (claimsRead.kind === "claims" && allFiles.length > 0)) {
    return { error: MEDIA_VERIFY_FAILED_MESSAGE };
  }
  const claims = claimsRead.kind === "claims" ? claimsRead.claims : null;

  const supabase = await createClient();
  // Direct uploads live under the prefix of the form's own id; the file path keeps a fresh server id.
  const submissionId = claims ? resolveSubmissionId(formData) : randomUUID();
  const createdAt = new Date().toISOString();
  const bucket = scopedSubmissionBucket(
    supabase.storage.from(SUBMISSIONS_BUCKET),
    submissionPathPrefix(organizationId, asset.id, submissionId)
  );

  let mediaPaths: string[] = [];
  let photos: Record<string, PhotoAnswer[]> = {};
  if (claims) {
    const slotError = checkClaimSlots(slots, claims);
    if (slotError) return { error: slotError };
    const verified = await verifyClaimedMedia(bucket, claims, {
      maxFiles: INSPECTION_MAX_FILES,
      maxTotalBytes: INSPECTION_MAX_TOTAL_BYTES,
    });
    if (!verified.ok) {
      return { error: verified.reason === "total" ? TOTAL_TOO_LARGE_MESSAGE : MEDIA_VERIFY_FAILED_MESSAGE };
    }
    ({ photos, mediaPaths } = groupVerifiedPhotos(slots, verified.media));
  } else {
    const mediaError = validateInspectionFiles(
      allFiles.map((f) => ({ type: f.type, size: f.size, name: f.name }))
    );
    if (mediaError) return { error: mediaError };

    // Per-slot maximum only (Phase 3C.1.1): no photo is a hard prerequisite (soft evidence below).
    for (const slot of slots) {
      const count = filesBySlot.get(slot.id)?.length ?? 0;
      const max = slot.photo?.maxPhotos ?? 6;
      if (count > max) return { error: `"${slot.label}" allows at most ${max} photos.` };
    }

    // Upload each slot's files (nothing completed yet — pure storage writes).
    for (const slot of slots) {
      const files = filesBySlot.get(slot.id) ?? [];
      const slotPhotos: PhotoAnswer[] = [];
      for (const file of files) {
        const path = `${bucket.prefix}/${mediaObjectName(randomUUID(), file.type)}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!(await bucket.upload(path, bytes, file.type))) {
          await bucket.remove(mediaPaths);
          return { error: "Could not upload your files. Please try again." };
        }
        mediaPaths.push(path);
        slotPhotos.push({ path, caption: slot.label });
      }
      if (slotPhotos.length > 0) photos[slot.id] = slotPhotos;
    }
  }

  // Only files uploaded by THIS request may be removed on failure; direct uploads stay for a retry.
  const discardUploadedFiles = async () => {
    if (!claims) await bucket.remove(mediaPaths);
  };

  const flags = deriveFlags(template, values);
  // Soft photo evidence (Phase 3C.1.1): server-authoritative counts + explicit omission ack.
  const totalPhotoCount = Object.values(photos).reduce((n, list) => n + list.length, 0);
  const evidence = resolvePhotoEvidence({
    damage: flags.damage_observed === "yes",
    damagePhotoCount: photos[DAMAGE_PHOTOS_SLOT_ID]?.length ?? 0,
    totalPhotoCount,
    hasPhotoSlots: slots.length > 0,
    acknowledged: readOmissionAck(formData),
  });
  if (evidence.error) {
    await discardUploadedFiles(); // omission not acknowledged → nothing committed
    return { error: evidence.error };
  }
  flags.damage_photos_missing = evidence.damagePhotosMissing;
  flags.condition_photos_missing = evidence.conditionPhotosMissing;

  const missingSlots = slots
    .filter((slot) => (photos[slot.id]?.length ?? 0) === 0)
    .map((slot) => slot.id);

  const status = staffReturnStatus({
    damage: flags.damage_observed === "yes",
    missing: flags.accessories_missing,
    flagged: flags.damage_observed === "yes" || flags.accessories_missing,
  });
  const data = {
    ...buildReturnSubmissionData({ template, answers: buildAnswers(values, photos), flags }),
    audience: "staff" as const,
    ...(missingSlots.length > 0 ? { missing_recommended_photo_slots: missingSlots } : {}),
    ...(evidence.damagePhotosMissing || evidence.conditionPhotosMissing
      ? { photo_omission_acknowledged: true }
      : {}),
  };

  // Atomic: insert the staff return, close the active session, clear the asset pointer (all-or-nothing).
  const { data: result, error: rpcError } = await supabase.rpc("complete_staff_return", {
    p_asset_id: asset.id,
    p_expected_session_id: expectedSessionId,
    p_submission_id: submissionId,
    p_created_at: createdAt,
    p_status: status,
    p_submitted_by_name: profile.name ?? null,
    p_submitted_by_email: profile.email ?? null,
    p_data: data,
    p_media: mediaPaths,
    p_template_key: template.key,
    p_template_version: template.version,
  });

  const code = (result as { result?: string; submission_id?: string } | null) ?? null;
  const outcome = rpcError ? null : code?.result;

  if (outcome === "completed" || outcome === "already_completed") {
    // A staff return closes the session + may leave the submission "new" (flagged) → refresh the nav badge.
    revalidateSubmissionSurfaces();
  }
  if (outcome === "completed") {
    // Committed: objects an earlier attempt left under this prefix are not referenced by the row.
    if (claims) await removeUnclaimedObjects(bucket, mediaPaths);
    redirect(`/staff/t/${shortCode}/return/complete?sub=${submissionId}`);
  }
  if (outcome === "already_completed") {
    // Idempotent replay — the return was already completed; go to the existing record.
    await discardUploadedFiles(); // this request's uploaded files were never committed
    redirect(`/staff/t/${shortCode}/return/complete?sub=${code?.submission_id ?? submissionId}`);
  }

  // Nothing committed → don't orphan the uploaded files, and map the failure.
  await discardUploadedFiles();
  if (outcome === "session_mismatch") {
    return { error: "This asset's rental changed. Reload the page and try again." };
  }
  if (outcome === "not_active") {
    return { error: "This asset has no active rental session to return." };
  }
  if (outcome === "not_found") return { error: "Asset not found." };
  return { error: "Could not complete the return. Please try again." };
}
