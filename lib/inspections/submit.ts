import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { HONEYPOT_FIELD } from "@/lib/forms/validate";
import {
  mediaObjectName,
  submissionPathPrefix,
  validateInspectionFiles,
} from "@/lib/forms/media";
import { notifySubmission } from "@/lib/notifications/notify";
import { submissionReference } from "@/lib/submissions/inbox";
import { resolveReturnTemplate } from "@/lib/inspections/resolve";
import {
  buildAnswers,
  deriveFlags,
  evaluateInspection,
  parseAnswerValues,
  visiblePhotoSlots,
} from "@/lib/inspections/validate";
import { buildReturnSubmissionData } from "@/lib/inspections/snapshot";
import type { PhotoAnswer } from "@/lib/inspections/types";
import type { PublicFormState } from "@/lib/forms/submit";

/**
 * Server-authoritative core for the guided return inspection (Return Inspection V2, Phase 1A). The
 * browser may send ONLY contact fields, `answer:<fieldId>` values, `photo:<slotId>` files, and the
 * honeypot. Everything else — organization_id, asset_id, form_type, status, the template + its
 * version + snapshot, the canonical flags, and the rental session — is derived server-side (the
 * rental session by the DB trigger). Reuses the existing eligibility resolver, storage path/upload
 * helpers, reference generator, and notifier. Anon client only (no service-role).
 */

const SUBMISSIONS_BUCKET = "submissions";
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

  // Honeypot: silently accept a bot without saving.
  if (readStr(formData, HONEYPOT_FIELD)) redirect(thanks);

  const supabase = createPublicClient();
  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) return { error: "This form is no longer available." };

  // Template resolved server-side from the asset's explicit assignment + category (never client input).
  const template = resolveReturnTemplate({
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

  // Collect files for VISIBLE photo slots only (files for hidden slots are ignored).
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

  // Per-slot minimums (required overview + conditional damage photos) and maximums.
  for (const slot of slots) {
    const count = filesBySlot.get(slot.id)?.length ?? 0;
    const min = slot.photo?.minPhotos ?? 0;
    const max = slot.photo?.maxPhotos ?? 6;
    if (count < min) {
      return { error: `Add at least ${min} photo${min === 1 ? "" : "s"} for "${slot.label}".` };
    }
    if (count > max) return { error: `"${slot.label}" allows at most ${max} photos.` };
  }

  // Upload each slot's files; record flat paths (media_urls) + per-slot metadata (answers.photos).
  const submissionId = randomUUID();
  const prefix = submissionPathPrefix(resolved.organizationId, resolved.assetId, submissionId);
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
      if (error) return { error: "Could not upload your files. Please try again." };
      mediaPaths.push(path);
      slotPhotos.push({ path, caption: slot.label });
    }
    if (slotPhotos.length > 0) photos[slot.id] = slotPhotos;
  }

  const flags = deriveFlags(template, values);
  const data = buildReturnSubmissionData({ template, answers: buildAnswers(values, photos), flags });

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
  if (insertError) return { error: "Could not submit the inspection. Please try again." };

  const reference = submissionReference(submissionId, createdAt);
  await notifySubmission({
    organizationId: resolved.organizationId,
    formType: "return_checklist",
    assetId: resolved.assetId,
    submittedBy: { name, email, phone },
    submissionId,
    reference,
  });

  redirect(`${thanks}?ref=${reference}`);
}
