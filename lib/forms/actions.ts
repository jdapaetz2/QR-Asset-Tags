"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { HONEYPOT_FIELD, validateDamageReport } from "@/lib/forms/validate";
import {
  mediaObjectName,
  submissionPathPrefix,
  validateUploadFiles,
} from "@/lib/forms/media";

export type DamageFormState = { error?: string };

const SUBMISSIONS_BUCKET = "submissions";

type UploadedFile = { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

function readString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readFiles(formData: FormData): UploadedFile[] {
  return formData
    .getAll("media")
    .filter(
      (entry): entry is File => typeof entry !== "string" && entry.size > 0
    );
}

/**
 * Public damage-report intake. organization_id, asset_id, form_type and status
 * are derived server-side — never from form input — and RLS re-checks the asset
 * is public + org-matched on insert. Uses the anon client only (no service-role).
 */
export async function submitDamageReport(
  shortCode: string,
  _prev: DamageFormState,
  formData: FormData
): Promise<DamageFormState> {
  // Honeypot: a filled hidden field means a bot. Silently accept without saving.
  if (readString(formData, HONEYPOT_FIELD)) {
    redirect(`/forms/${shortCode}/damage/thanks`);
  }

  const supabase = createPublicClient();

  // Same public eligibility as /t/[shortCode]; blocks private/draft/disabled/missing.
  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) {
    return { error: "This form is no longer available." };
  }

  const name = readString(formData, "name");
  const email = readString(formData, "email");
  const phone = readString(formData, "phone");
  const urgency = readString(formData, "urgency");
  const description = readString(formData, "description");

  const fieldError = validateDamageReport({
    name,
    email,
    phone,
    urgency,
    description,
  });
  if (fieldError) return { error: fieldError };

  const files = readFiles(formData);
  const fileError = validateUploadFiles(
    files.map((f) => ({ type: f.type, size: f.size }))
  );
  if (fileError) return { error: fileError };

  // Server-built, org/asset-scoped storage path (matches the anon-insert policy).
  const submissionId = randomUUID();
  const prefix = submissionPathPrefix(
    resolved.organizationId,
    resolved.assetId,
    submissionId
  );

  const mediaPaths: string[] = [];
  for (const file of files) {
    const path = `${prefix}/${mediaObjectName(randomUUID(), file.type)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error } = await supabase.storage
      .from(SUBMISSIONS_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) {
      return { error: "Could not upload your photos. Please try again." };
    }
    mediaPaths.push(path);
  }

  const { error: insertError } = await supabase.from("form_submissions").insert({
    organization_id: resolved.organizationId,
    asset_id: resolved.assetId,
    form_type: "damage_report",
    status: "new",
    submitted_by_name: name,
    submitted_by_email: email,
    submitted_by_phone: phone,
    submission_data_json: { urgency: urgency ?? null, description },
    media_urls: mediaPaths,
  });

  if (insertError) {
    return { error: "Could not submit your report. Please try again." };
  }

  redirect(`/forms/${shortCode}/damage/thanks`);
}
