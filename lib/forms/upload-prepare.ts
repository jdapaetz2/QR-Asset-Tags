import "server-only";

import { randomUUID } from "node:crypto";

import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { requireStaffAssetByShortCode } from "@/lib/staff/guard";
import { submissionPathPrefix, validateInspectionFiles, validateUploadFiles } from "@/lib/forms/media";
import { SUBMISSIONS_BUCKET, mintSignedUploads, scopedSubmissionBucket } from "@/lib/forms/media-verify";
import { publicSubmissionBucket } from "@/lib/forms/upload-intake";
import { checkRateLimit } from "@/lib/ratelimit/limiter";
import { RATE_LIMITED_MESSAGE } from "@/lib/ratelimit/policy";
import { logAbuseEvent } from "@/lib/ratelimit/log";
import { resolveReturnTemplate } from "@/lib/inspections/resolve";
import { getAssetReturnTemplate } from "@/lib/inspections/org-templates-data";
import { resolveStaffReturnTemplate } from "@/lib/inspections/staff-return-templates";
import { resolveOutboundTemplate } from "@/lib/inspections/outbound-templates";
import type { InspectionTemplate } from "@/lib/inspections/types";
import {
  MAX_DECLARED_FILES,
  UPLOAD_FAILED_MESSAGE,
  type DeclaredFile,
  type PrepareUploadsRequest,
  type PrepareUploadsResult,
} from "@/lib/forms/upload-contract";

/**
 * Step 1 of a direct photo upload (lib/forms/upload-contract.ts): the server receives only file METADATA, runs the
 * same gates the submit cores run before touching storage, and returns one signed upload URL per photo at a
 * server-chosen path under this submission's prefix.
 *
 * Public flows: honeypot → shared rate limiter (the token for this submission is spent HERE) → live public tag →
 * declared type/size/count/slot caps → signed URLs minted with the prefix-scoped service-role handle. Staff flows:
 * the staff guard (own organization only) → template slot caps → signed URLs minted with the staff user's own
 * session, which the authenticated org storage policy authorizes.
 *
 * A signed URL is valid for one object at one path, cannot overwrite, and expires. Nothing is trusted from it: the
 * submit core verifies every uploaded object before a row references it.
 */

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const SLOT_MISMATCH_MESSAGE = "Those photos don't match this form. Reload the page and try again.";

function submissionIdFrom(request: PrepareUploadsRequest | null | undefined): string {
  const id = request?.submissionId;
  return typeof id === "string" && UUID_RE.test(id) ? id : randomUUID();
}

/** Structurally sound declared files, or null. Values are re-validated against the caps by the caller. */
export function sanitizeDeclaredFiles(request: PrepareUploadsRequest | null | undefined): DeclaredFile[] | null {
  const files = Array.isArray(request?.files) ? request.files : null;
  if (!files || files.length === 0 || files.length > MAX_DECLARED_FILES) return null;
  const out: DeclaredFile[] = [];
  for (const entry of files) {
    if (!entry || typeof entry !== "object") return null;
    const { slotId, name, size, type } = entry as Record<string, unknown>;
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return null;
    if (typeof type !== "string" || type.length > 100) return null;
    if (slotId !== null && slotId !== undefined && (typeof slotId !== "string" || slotId.length === 0 || slotId.length > 100)) {
      return null;
    }
    out.push({
      slotId: typeof slotId === "string" ? slotId : null,
      name: typeof name === "string" ? name.slice(0, 255) : "",
      size,
      type,
    });
  }
  return out;
}

/** Checklist flows: every file names a photo slot of the template, within its per-slot max and the global caps. */
export function inspectionDeclaredError(template: InspectionTemplate, files: DeclaredFile[]): string | null {
  const slots = new Map(
    template.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.type === "photo_slot")
      .map((field) => [field.id, field])
  );
  const counts = new Map<string, number>();
  for (const file of files) {
    const slot = file.slotId ? slots.get(file.slotId) : undefined;
    if (!slot) return SLOT_MISMATCH_MESSAGE;
    counts.set(slot.id, (counts.get(slot.id) ?? 0) + 1);
  }
  for (const [slotId, count] of counts) {
    const slot = slots.get(slotId);
    const max = slot?.photo?.maxPhotos ?? 6;
    if (count > max) return `"${slot?.label ?? "Photos"}" allows at most ${max} photos.`;
  }
  return validateInspectionFiles(files.map((file) => ({ type: file.type, size: file.size, name: file.name })));
}

/** Damage/support: no slots, the existing 5 × 10 MB image caps. */
export function reportDeclaredError(files: DeclaredFile[]): string | null {
  if (files.some((file) => file.slotId !== null)) return SLOT_MISMATCH_MESSAGE;
  return validateUploadFiles(files.map((file) => ({ type: file.type, size: file.size })));
}

export type PublicUploadFlow = "damage" | "support" | "return";

export async function preparePublicUploads(
  shortCode: string,
  flow: PublicUploadFlow,
  request: PrepareUploadsRequest
): Promise<PrepareUploadsResult> {
  const correlationId = randomUUID();
  const submissionId = submissionIdFrom(request);

  // Honeypot: a bot gets an empty success and uploads nothing; its finalize is dropped the same way.
  if (typeof request?.honeypot === "string" && request.honeypot.trim().length > 0) {
    return { ok: true, submissionId, uploads: [] };
  }

  const files = sanitizeDeclaredFiles(request);
  if (!files) return { ok: false, error: UPLOAD_FAILED_MESSAGE };

  const action = flow === "return" ? "return" : "damage_support";
  const rl = await checkRateLimit({ action, shortCode, hasMedia: true, correlationId });
  if (!rl.allowed) {
    logAbuseEvent({ action, correlationId, shortCodeHash: rl.shortCodeHash, limiter: "limited", fileCount: files.length });
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  const supabase = createPublicClient();
  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) return { ok: false, error: "This form is no longer available." };

  let fileError: string | null;
  if (flow === "return") {
    const custom = resolved.returnInspectionTemplateId
      ? await getAssetReturnTemplate(supabase, resolved.assetId)
      : null;
    const template =
      custom?.definition ??
      resolveReturnTemplate({ assignmentKey: resolved.returnInspectionTemplateKey, category: resolved.category });
    fileError = inspectionDeclaredError(template, files);
  } else {
    fileError = reportDeclaredError(files);
  }
  if (fileError) return { ok: false, error: fileError };

  const bucket = publicSubmissionBucket(submissionPathPrefix(resolved.organizationId, resolved.assetId, submissionId));
  const uploads = await mintSignedUploads(bucket, files);
  if (!uploads) {
    logAbuseEvent({
      action,
      correlationId,
      shortCodeHash: rl.shortCodeHash,
      limiter: "allowed",
      fileCount: files.length,
      failure: "sign",
    });
    return { ok: false, error: UPLOAD_FAILED_MESSAGE };
  }
  return { ok: true, submissionId, uploads };
}

export type StaffUploadFlow = "staff_return" | "outbound";

export async function prepareStaffUploads(
  shortCode: string,
  flow: StaffUploadFlow,
  request: PrepareUploadsRequest
): Promise<PrepareUploadsResult> {
  // Auth + own-org asset (cross-org/unknown short code → notFound via the guard).
  const { organizationId, asset } = await requireStaffAssetByShortCode(shortCode);
  const submissionId = submissionIdFrom(request);
  const files = sanitizeDeclaredFiles(request);
  if (!files) return { ok: false, error: UPLOAD_FAILED_MESSAGE };

  const input = { assignmentKey: asset.return_inspection_template_key, category: asset.category };
  const template = flow === "outbound" ? resolveOutboundTemplate(input) : resolveStaffReturnTemplate(input);
  const fileError = inspectionDeclaredError(template, files);
  if (fileError) return { ok: false, error: fileError };

  const supabase = await createClient();
  const bucket = scopedSubmissionBucket(
    supabase.storage.from(SUBMISSIONS_BUCKET),
    submissionPathPrefix(organizationId, asset.id, submissionId)
  );
  const uploads = await mintSignedUploads(bucket, files);
  if (!uploads) return { ok: false, error: UPLOAD_FAILED_MESSAGE };
  return { ok: true, submissionId, uploads };
}
