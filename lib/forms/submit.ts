import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { HONEYPOT_FIELD } from "@/lib/forms/validate";
import {
  mediaObjectName,
  submissionPathPrefix,
  validateUploadFiles,
} from "@/lib/forms/media";
import { notifySubmission } from "@/lib/notifications/notify";

/**
 * Shared server-side core for all public form submissions (damage / support /
 * return). organization_id, asset_id, form_type and status are always derived
 * server-side — never from form input — and RLS re-checks the asset is public +
 * org-matched on insert. Uses the anon client only (no service-role). Imported
 * by the "use server" actions; not a server action itself.
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

export async function submitPublicForm(
  shortCode: string,
  formData: FormData,
  config: PublicFormConfig
): Promise<PublicFormState> {
  const thanks = `/forms/${shortCode}/${config.thanksSlug}/thanks`;

  // Honeypot: a filled hidden field means a bot. Silently accept without saving.
  if (readString(formData, HONEYPOT_FIELD)) {
    redirect(thanks);
  }

  const supabase = createPublicClient();

  // Same public eligibility as /t/[shortCode]; blocks private/draft/disabled/missing.
  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) {
    return { error: "This form is no longer available." };
  }

  if (config.fieldError) return { error: config.fieldError };

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
      return { error: "Could not upload your files. Please try again." };
    }
    mediaPaths.push(path);
  }

  // Use the id we already generated as the row id so we can build a stable admin
  // link for the notification without selecting the row back (anon can't read
  // submissions).
  const { error: insertError } = await supabase.from("form_submissions").insert({
    id: submissionId,
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

  if (insertError) {
    return { error: "Could not submit the form. Please try again." };
  }

  // Best-effort email alert. notifySubmission swallows its own errors, so a
  // notification failure can never block the submission.
  await notifySubmission({
    organizationId: resolved.organizationId,
    formType: config.formType,
    assetId: resolved.assetId,
    submittedBy: config.submittedBy,
    submissionId,
  });

  redirect(thanks);
}
