import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import {
  mediaObjectName,
  submissionPathPrefix,
  validateInspectionFiles,
} from "@/lib/forms/media";
import { resolveStaffReturnTemplate } from "@/lib/inspections/staff-return-templates";
import { staffReturnStatus } from "@/lib/submissions/returns";
import {
  buildAnswers,
  deriveFlags,
  evaluateInspection,
  parseAnswerValues,
  readOmissionAck,
  resolveDamagePhotoEvidence,
  visiblePhotoSlots,
} from "@/lib/inspections/validate";
import { DAMAGE_PHOTOS_SLOT_ID } from "@/lib/inspections/templates";
import { buildReturnSubmissionData } from "@/lib/inspections/snapshot";
import type { PhotoAnswer } from "@/lib/inspections/types";
import type { PublicFormState } from "@/lib/forms/submit";

/**
 * Server-authoritative core for the STAFF return inspection (Phase 3A.1). Runs as the AUTHENTICATED staff
 * user (RLS-scoped client) and, on success, COMPLETES the physical return atomically via the
 * `complete_staff_return` RPC: it inserts the staff return, closes the active rental session, and clears the
 * asset pointer in one transaction. Staff identity is derived from the session (never client input), there
 * is no renter contact/acknowledgement, and no separate "Mark returned & resolve" step is needed. Staged
 * safe flow: validate answers → collect + validate media → upload → RPC. Media are cleaned up if the RPC
 * does not complete. Idempotent: a replay returns the existing completion instead of a duplicate.
 */

const SUBMISSIONS_BUCKET = "submissions";

async function cleanupMedia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(SUBMISSIONS_BUCKET).remove(paths);
  } catch {
    // best-effort — orphaned objects are harmless and swept by storage lifecycle
  }
}

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

  const supabase = await createClient();

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

  const mediaError = validateInspectionFiles(
    allFiles.map((f) => ({ type: f.type, size: f.size, name: f.name }))
  );
  if (mediaError) return { error: mediaError };

  for (const slot of slots) {
    const count = filesBySlot.get(slot.id)?.length ?? 0;
    const min = slot.photo?.minPhotos ?? 0;
    const max = slot.photo?.maxPhotos ?? 6;
    if (count < min) {
      return { error: `Add at least ${min} photo${min === 1 ? "" : "s"} for "${slot.label}".` };
    }
    if (count > max) return { error: `"${slot.label}" allows at most ${max} photos.` };
  }

  // Upload each slot's files (nothing completed yet — pure storage writes).
  const submissionId = randomUUID();
  const createdAt = new Date().toISOString();
  const prefix = submissionPathPrefix(organizationId, asset.id, submissionId);
  const mediaPaths: string[] = [];
  const photos: Record<string, PhotoAnswer[]> = {};
  for (const slot of slots) {
    const files = filesBySlot.get(slot.id) ?? [];
    const slotPhotos: PhotoAnswer[] = [];
    for (const file of files) {
      const path = `${prefix}/${mediaObjectName(randomUUID(), file.type)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .upload(path, bytes, { contentType: file.type, upsert: false });
      if (error) {
        await cleanupMedia(supabase, mediaPaths);
        return { error: "Could not upload your files. Please try again." };
      }
      mediaPaths.push(path);
      slotPhotos.push({ path, caption: slot.label });
    }
    if (slotPhotos.length > 0) photos[slot.id] = slotPhotos;
  }

  const flags = deriveFlags(template, values);
  // Soft damage-photo evidence (Phase 3C.1): server-authoritative count + explicit omission ack.
  const evidence = resolveDamagePhotoEvidence({
    damage: flags.damage_observed === "yes",
    damagePhotoCount: photos[DAMAGE_PHOTOS_SLOT_ID]?.length ?? 0,
    acknowledged: readOmissionAck(formData),
  });
  if (evidence.error) return { error: evidence.error };
  flags.damage_photos_missing = evidence.missing;

  const status = staffReturnStatus({
    damage: flags.damage_observed === "yes",
    missing: flags.accessories_missing,
    flagged: flags.damage_observed === "yes" || flags.accessories_missing,
  });
  const data = {
    ...buildReturnSubmissionData({ template, answers: buildAnswers(values, photos), flags }),
    audience: "staff" as const,
    ...(evidence.missing ? { damage_photo_omission_acknowledged: true } : {}),
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

  if (outcome === "completed") {
    redirect(`/staff/t/${shortCode}/return/complete?sub=${submissionId}`);
  }
  if (outcome === "already_completed") {
    // Idempotent replay — the return was already completed; go to the existing record.
    await cleanupMedia(supabase, mediaPaths); // this submission's media were never committed
    redirect(`/staff/t/${shortCode}/return/complete?sub=${code?.submission_id ?? submissionId}`);
  }

  // Nothing committed → don't orphan the uploaded media, and map the failure.
  await cleanupMedia(supabase, mediaPaths);
  if (outcome === "session_mismatch") {
    return { error: "This asset's rental changed. Reload the page and try again." };
  }
  if (outcome === "not_active") {
    return { error: "This asset has no active rental session to return." };
  }
  if (outcome === "not_found") return { error: "Asset not found." };
  return { error: "Could not complete the return. Please try again." };
}
