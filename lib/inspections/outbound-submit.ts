import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import {
  mediaObjectName,
  submissionPathPrefix,
  validateInspectionFiles,
} from "@/lib/forms/media";
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
import type { PhotoAnswer } from "@/lib/inspections/types";
import type { PublicFormState } from "@/lib/forms/submit";

/**
 * Server-authoritative core for the STAFF outbound (pre-use) inspection (Phase 3A). Unlike the public
 * return submit, this runs as the AUTHENTICATED staff user (RLS-scoped client) and, on success, marks the
 * asset rented atomically via the `start_outbound_rental` RPC. Staged safe flow: validate answers → collect
 * + validate media → upload → RPC. The rental session is NEVER created until the answers + required media
 * are valid; if the RPC does not return 'started', the just-uploaded media are removed (best-effort).
 * Reuses the entire parse → evaluate → media → snapshot pipeline from the return engine.
 */

const SUBMISSIONS_BUCKET = "submissions";

function readStr(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

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

  // Per-slot MAXIMUM only (Phase 3C.6): outbound photos are strongly expected but non-blocking, matching the
  // return soft-evidence model — no `count < min` hard prerequisite. Omission is confirmed + recorded below.
  for (const slot of slots) {
    const count = filesBySlot.get(slot.id)?.length ?? 0;
    const max = slot.photo?.maxPhotos ?? 6;
    if (count > max) return { error: `"${slot.label}" allows at most ${max} photos.` };
  }

  // Upload each slot's files (nothing rented yet — pure storage writes).
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
    await cleanupMedia(supabase, mediaPaths); // omission not acknowledged → nothing committed, drop uploads
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
    await cleanupMedia(supabase, mediaPaths); // nothing was committed → don't orphan media
    return { error: outboundResultError(String(code ?? "")) };
  }

  const reference = submissionReference(submissionId, createdAt);
  redirect(`/staff/t/${shortCode}?${flag}=${reference}`);
}
