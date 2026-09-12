import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import {
  INSPECTION_MAX_FILES,
  INSPECTION_MAX_TOTAL_BYTES,
  mediaObjectName,
  NO_JS_PHOTO_MESSAGE,
  submissionPathPrefix,
  validateInspectionFiles,
} from "@/lib/forms/media";
import { readNoJsPhotoBytes } from "@/lib/forms/no-js-photos";
import { resolveSubmissionId } from "@/lib/forms/submit";
import {
  SUBMISSIONS_BUCKET,
  readMediaClaims,
  removeUnclaimedObjects,
  scopedSubmissionBucket,
  verifyClaimedMedia,
} from "@/lib/forms/media-verify";
import { MEDIA_VERIFY_FAILED_MESSAGE } from "@/lib/forms/upload-contract";
import { submissionReference } from "@/lib/submissions/inbox";
import { normalizeRentalStart } from "@/lib/rentals/rentals";
import { resolveOutboundTemplate } from "@/lib/inspections/outbound-templates";
import { DAMAGE_PHOTOS_SLOT_ID } from "@/lib/inspections/templates";
import {
  buildAnswers,
  deriveFlags,
  evaluateInspection,
  parseAnswerValues,
  readOmissionAck,
  resolvePhotoEvidence,
  visiblePhotoSlots,
} from "@/lib/inspections/validate";
import { buildReturnSubmissionData } from "@/lib/inspections/snapshot";
import {
  outboundResultError,
  outboundSuccessFlag,
} from "@/lib/inspections/outbound-session";
import { checkClaimSlots, groupVerifiedPhotos, TOTAL_TOO_LARGE_MESSAGE } from "@/lib/inspections/claimed-photos";
import type { PhotoAnswer } from "@/lib/inspections/types";
import type { PublicFormState } from "@/lib/forms/submit";

/**
 * Server-authoritative core for the STAFF outbound (pre-use) inspection (Phase 3A). Unlike the public
 * return submit, this runs as the AUTHENTICATED staff user (RLS-scoped client) and, on success, marks the
 * asset rented atomically via the `start_outbound_rental` RPC. Staged safe flow: validate answers → verify
 * claimed photos (or validate + upload files) → RPC. The rental session is NEVER created until the answers +
 * media are valid; if the RPC does not return 'started', media uploaded by this request are removed (best-effort).
 * Reuses the entire parse → evaluate → media → snapshot pipeline from the return engine.
 *
 * Photos uploaded directly to storage (lib/forms/upload-contract.ts) are claimed via `media_paths` and verified
 * with the staff user's own session, which the authenticated org storage policies authorize.
 */

function readStr(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

export async function submitOutboundInspectionCore(
  shortCode: string,
  formData: FormData
): Promise<PublicFormState> {
  // Auth + own-org asset (cross-org/unknown short code → notFound via the guard). An active rental session is
  // NO LONGER a hard block (Phase 3C.6): the RPC either creates a session or attaches this baseline to the
  // existing one; it returns baseline_already_exists if that session already has a baseline.

  const { profile, organizationId, asset } = await requireStaffAssetByShortCode(shortCode);

  // Outbound template resolved server-side from the asset's system key + category (never client input).
  const template = resolveOutboundTemplate({
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

    // Per-slot MAXIMUM only (Phase 3C.6): outbound photos are strongly expected but non-blocking, matching the
    // return soft-evidence model — no `count < min` hard prerequisite. Omission is confirmed + recorded below.
    for (const slot of slots) {
      const count = filesBySlot.get(slot.id)?.length ?? 0;
      const max = slot.photo?.maxPhotos ?? 6;
      if (count > max) return { error: `"${slot.label}" allows at most ${max} photos.` };
    }

    const bytesByFile = await readNoJsPhotoBytes(allFiles);
    if (!bytesByFile) return { error: NO_JS_PHOTO_MESSAGE };

    // Upload each slot's files (nothing rented yet — pure storage writes).
    for (const slot of slots) {
      const files = filesBySlot.get(slot.id) ?? [];
      const slotPhotos: PhotoAnswer[] = [];
      for (const file of files) {
        const path = `${bucket.prefix}/${mediaObjectName(randomUUID(), file.type)}`;
        const bytes = bytesByFile.get(file) as Uint8Array;
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
  // Soft photo evidence (Phase 3C.6): server-authoritative counts + explicit omission ack (existing-damage
  // photo priority). Photos are never a hard prerequisite; omission is recorded on the baseline.
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

  const data = {
    ...buildReturnSubmissionData({ template, answers: buildAnswers(values, photos), flags }),
    ...(missingSlots.length > 0 ? { missing_recommended_photo_slots: missingSlots } : {}),
    ...(evidence.damagePhotosMissing || evidence.conditionPhotosMissing
      ? { photo_omission_acknowledged: true }
      : {}),
  };

  const { rental_reference, renter_label } = normalizeRentalStart({
    rental_reference: readStr(formData, "rental_reference"),
    renter_label: readStr(formData, "renter_label"),
  });

  // Atomic: create a session (+ mark rented) OR attach this baseline to the existing active session — the RPC
  // decides based on the asset's server-side state (never a client-provided session id).
  const { data: code, error: rpcError } = await supabase.rpc("start_outbound_rental", {
    p_asset_id: asset.id,
    p_submission_id: submissionId,
    p_created_at: createdAt,
    p_reference: rental_reference,
    p_renter_label: renter_label,
    p_submitted_by: profile.name ?? null,
    p_data: data,
    p_media: mediaPaths,
    p_template_key: template.key,
    p_template_version: template.version,
  });

  const flag = rpcError ? null : outboundSuccessFlag(String(code ?? ""));
  if (rpcError || !flag) {
    await discardUploadedFiles(); // nothing was committed → don't orphan this request's files
    return { error: outboundResultError(String(code ?? "")) };
  }

  // Committed: objects an earlier attempt left under this prefix are not referenced by the baseline.
  if (claims) await removeUnclaimedObjects(bucket, mediaPaths);

  const reference = submissionReference(submissionId, createdAt);
  redirect(`/staff/t/${shortCode}?${flag}=${reference}`);
}
