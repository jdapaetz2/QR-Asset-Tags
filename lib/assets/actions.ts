"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { normalizeAssetForm, type RawAssetForm } from "@/lib/assets/validate";
import { deleteEligibility } from "@/lib/assets/list";
import { resolveReturnTemplateKey } from "@/lib/inspections/resolve";
import { getOrgCategoryDefaults } from "@/lib/inspections/category-defaults-data";
import {
  buildCategoryDefaultTargetLookup,
  categoryDefaultTargetForCategory,
} from "@/lib/inspections/category-defaults";
import {
  COVER_BUCKET,
  COVER_CLAIM_FIELD,
  coverObjectName,
  coverPathPrefix,
  coverUrlForSave,
  isCoverClaim,
  managedCoverObjectPath,
  validateCoverFile,
} from "@/lib/assets/cover";
import { COVER_OBJECT_RULES, coverStorage } from "@/lib/assets/cover-storage";
import { verifyClaimedObject } from "@/lib/storage/verify-object";
import {
  FILE_CHECK_FAILED_MESSAGE,
  FILE_VERIFY_FAILED_MESSAGE,
  isUuid,
  readDeclaredUpload,
  type DeclaredUpload,
  type PreparedSingleUpload,
} from "@/lib/storage/direct-upload";
import { backHref, withReturnTo } from "@/lib/nav/return-to";

export type AssetFormState = { error?: string };

type UploadedFile = {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

function readCoverFile(formData: FormData): UploadedFile | null {
  const entry = formData.get("file");
  if (typeof entry === "string" || !entry || entry.size === 0) return null;
  return entry;
}

/** The path of a cover image the browser already uploaded (lib/storage/direct-upload.ts), or null. */
function readCoverClaim(formData: FormData): string | null {
  const value = formData.get(COVER_CLAIM_FIELD);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const FIELDS = [
  "asset_code",
  "asset_name",
  "category",
  "make",
  "model",
  "serial_number",
  "year",
  "support_phone_override",
  "support_email_override",
  "cover_image_url",
  "internal_notes",
  "return_inspection_template_key",
  "return_inspection_template_id",
] as const;

function readForm(formData: FormData): RawAssetForm {
  const raw: RawAssetForm = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  return raw;
}

/** Create an asset for the signed-in user's organization. */
export async function createAsset(
  _prev: AssetFormState,
  formData: FormData
): Promise<AssetFormState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const result = normalizeAssetForm(readForm(formData));
  if (!result.value) return { error: result.error };

  const supabase = await createClient();

  // Resolve the stored assignment. An explicit form choice (custom id or system key) wins. Otherwise apply
  // the org category default — which may target a published CUSTOM template (id) or a system key — then a
  // conservative system suggestion, then generic. Every new asset ends up with exactly one of
  // {template_id, template_key} stored; the public route never consults the defaults table.
  let return_inspection_template_id = result.value.return_inspection_template_id;
  let return_inspection_template_key = result.value.return_inspection_template_key;
  if (!return_inspection_template_id && !return_inspection_template_key) {
    const targets = buildCategoryDefaultTargetLookup(await getOrgCategoryDefaults(supabase));
    const target = categoryDefaultTargetForCategory(result.value.category, targets);
    if (target?.templateId) {
      return_inspection_template_id = target.templateId;
    } else {
      return_inspection_template_key =
        target?.templateKey ??
        resolveReturnTemplateKey({ assignmentKey: null, category: result.value.category }).key;
    }
  }

  const { data, error } = await supabase
    .from("assets")
    // organization_id comes from the profile, never from user input. RLS also
    // rejects any other org via the policy's WITH CHECK. public_status defaults
    // to 'private' (safe/unpublished) at the database level.
    .insert({
      ...result.value,
      return_inspection_template_key,
      return_inspection_template_id,
      organization_id: profile.organization_id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "An asset with that code already exists." };
    }
    return { error: "Could not create the asset. Please try again." };
  }

  redirect(`/dashboard/assets/${data.id}`);
}

/**
 * Step 1 of a cover-image upload (lib/storage/direct-upload.ts). Vercel refuses request bodies over 4.5 MB and a cover
 * may be 5 MB, so the image never passes through here: this validates the DECLARED image for an asset the caller can
 * see and returns one signed upload URL for a server-built path, signed with the caller's own RLS client (the
 * cover bucket's org write storage policy, 0002, must also allow it). `updateAsset` verifies the stored object before
 * the asset references it.
 */
export async function prepareCoverUpload(
  assetId: string,
  declared: DeclaredUpload
): Promise<PreparedSingleUpload> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { ok: false, error: "Your account is not attached to an organization." };
  }
  const file = readDeclaredUpload(declared);
  if (!file) return { ok: false, error: "Choose an image to upload." };
  const fileError = validateCoverFile(file);
  if (fileError) return { ok: false, error: fileError };
  if (!isUuid(assetId)) return { ok: false, error: "Asset not found." };

  const supabase = await createClient();
  // RLS-scoped: another org's asset isn't returned → no URL for a cross-org path.
  const { data: asset } = await supabase.from("assets").select("id").eq("id", assetId).maybeSingle();
  if (!asset) return { ok: false, error: "Asset not found." };

  const prefix = coverPathPrefix(profile.organization_id, assetId);
  const path = `${prefix}/${coverObjectName(randomUUID(), file.type)}`;
  const signedUrl = await coverStorage(supabase.storage.from(COVER_BUCKET), prefix).signUpload(path);
  if (!signedUrl) return { ok: false, error: "Could not start the upload. Please try again." };
  return { ok: true, path, signedUrl };
}

/**
 * Update an asset the caller owns (RLS limits this to their own organization).
 * Single save flow: persists the text fields AND the cover image — either an
 * uploaded image (which wins over the URL field) or the validated URL/path, or
 * null to clear it. With JavaScript the image was already uploaded straight to
 * storage and arrives as `cover_claim`; without it, as a file in this request.
 */
export async function updateAsset(
  assetId: string,
  _prev: AssetFormState,
  formData: FormData
): Promise<AssetFormState> {
  const profile = await requireProfile();

  const file = readCoverFile(formData);
  const claim = readCoverClaim(formData);

  const raw = readForm(formData);
  // An image wins: ignore the typed URL when one is chosen (avoids stale-URL errors).
  raw.cover_image_url = coverUrlForSave({
    hasFile: Boolean(file || claim),
    urlValue: raw.cover_image_url,
  });

  const result = normalizeAssetForm(raw);
  if (!result.value) return { error: result.error };

  // Validate the upload before any I/O.
  if (file) {
    const fileError = validateCoverFile({ type: file.type, size: file.size });
    if (fileError) return { error: fileError };
    if (!profile.organization_id) {
      return { error: "Your account is not attached to an organization." };
    }
  }
  if (claim && !profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const supabase = await createClient();

  // RLS-scoped: another org's asset isn't returned → blocks cross-org edits, and
  // gives us the previous cover image for best-effort cleanup.
  const { data: existing } = await supabase
    .from("assets")
    .select("organization_id, cover_image_url")
    .eq("id", assetId)
    .maybeSingle();
  if (!existing) return { error: "Asset not found." };

  // Resolve the final cover image: an uploaded file wins; otherwise the URL field.
  let coverImageUrl = result.value.cover_image_url;
  let uploadedPath: string | null = null;
  if (claim && profile.organization_id) {
    // Verify the stored object — this organization and asset's cover folder, JPEG/PNG/WebP by stored type,
    // extension and leading bytes, ≤ 5 MB — before the asset references it.
    if (!isCoverClaim(claim, profile.organization_id, assetId)) return { error: FILE_VERIFY_FAILED_MESSAGE };
    const bucket = coverStorage(
      supabase.storage.from(COVER_BUCKET),
      coverPathPrefix(profile.organization_id, assetId)
    );
    const verified = await verifyClaimedObject(bucket, claim, COVER_OBJECT_RULES);
    if (!verified.ok) {
      return { error: verified.reason === "storage" ? FILE_CHECK_FAILED_MESSAGE : FILE_VERIFY_FAILED_MESSAGE };
    }
    uploadedPath = claim;
    // Stable public URL (public bucket) — never a signed/expiring URL.
    coverImageUrl = supabase.storage.from(COVER_BUCKET).getPublicUrl(claim).data.publicUrl;
  } else if (file && profile.organization_id) {
    uploadedPath = `${coverPathPrefix(
      profile.organization_id,
      assetId
    )}/${coverObjectName(randomUUID(), file.type)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(COVER_BUCKET)
      .upload(uploadedPath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) {
      return { error: "Could not upload the image. Please try again." };
    }
    // Stable public URL (public bucket) — never a signed/expiring URL.
    coverImageUrl = supabase.storage
      .from(COVER_BUCKET)
      .getPublicUrl(uploadedPath).data.publicUrl;
  }

  // public_status is intentionally not updated here (publishing is its own action).
  const { data, error } = await supabase
    .from("assets")
    .update({ ...result.value, cover_image_url: coverImageUrl })
    .eq("id", assetId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    // Roll back a just-uploaded object so we don't orphan it.
    if (uploadedPath) {
      await supabase.storage.from(COVER_BUCKET).remove([uploadedPath]);
    }
    if (error?.code === "23505") {
      return { error: "An asset with that code already exists." };
    }
    // No row updated → not the caller's asset (or missing). RLS is the boundary.
    return { error: error ? "Could not save changes. Please try again." : "Asset not found." };
  }

  // Best-effort: remove the previous app-managed object (never external URLs).
  const orgId = profile.organization_id ?? existing.organization_id;
  const oldPath = managedCoverObjectPath(existing.cover_image_url, orgId, assetId);
  if (oldPath && oldPath !== uploadedPath) {
    await supabase.storage.from(COVER_BUCKET).remove([oldPath]);
  }

  // Stay on the detail but keep the originating list context so its "← Assets" still works (Wave 3N.2).
  redirect(withReturnTo(`/dashboard/assets/${assetId}`, formData.get("returnTo")));
}

const PUBLIC_STATUSES = ["public", "private"] as const;

/**
 * Explicit publish control: set an asset public or private. Kept separate from
 * `updateAsset` so publishing is a deliberate, isolated action. RLS scopes the
 * update to the caller's own organization.
 */
export async function setAssetPublicStatus(
  assetId: string,
  status: string,
  returnTo: string | undefined,
  _prev: AssetFormState,
  _formData: FormData
): Promise<AssetFormState> {
  if (!(PUBLIC_STATUSES as readonly string[]).includes(status)) {
    return { error: "Invalid status." };
  }
  await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ public_status: status })
    .eq("id", assetId)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Could not update the asset." };
  if (!data) return { error: "Asset not found." };

  redirect(withReturnTo(`/dashboard/assets/${assetId}`, returnTo));
}

/** Archive (retire) an asset — hides it from the default list; history is kept. */
export async function archiveAsset(
  assetId: string,
  returnTo: string | undefined,
  _prev: AssetFormState,
  _formData: FormData
): Promise<AssetFormState> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", assetId)
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not archive the asset." };
  if (!data) return { error: "Asset not found." };
  redirect(withReturnTo(`/dashboard/assets/${assetId}`, returnTo));
}

/** Restore an archived asset back to the active list. */
export async function restoreAsset(
  assetId: string,
  returnTo: string | undefined,
  _prev: AssetFormState,
  _formData: FormData
): Promise<AssetFormState> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ archived_at: null })
    .eq("id", assetId)
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not restore the asset." };
  if (!data) return { error: "Asset not found." };
  redirect(withReturnTo(`/dashboard/assets/${assetId}`, returnTo));
}

/**
 * Permanently delete an asset — ONLY when it has no dependent history. The check
 * is re-run server-side (never trust the UI). Anything with QR links, scans,
 * submissions, documents, or an equipment page must be archived instead. RLS
 * scopes everything to the caller's own organization.
 */
export async function deleteAsset(
  assetId: string,
  returnTo: string | undefined,
  _prev: AssetFormState,
  _formData: FormData
): Promise<AssetFormState> {
  await requireProfile();
  const supabase = await createClient();

  // Confirm the asset is the caller's (RLS) before counting dependencies.
  const { data: asset } = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return { error: "Asset not found." };

  const count = async (table: string): Promise<number> => {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId);
    return count ?? 0;
  };
  const deps = {
    qr: await count("qr_links"),
    scans: await count("scan_events"),
    submissions: await count("form_submissions"),
    documents: await count("documents"),
    page: await count("equipment_pages"),
  };
  const { canDelete, reason } = deleteEligibility(deps);
  if (!canDelete) return { error: reason };

  const { error } = await supabase.from("assets").delete().eq("id", assetId);
  if (error) return { error: "Could not delete the asset." };

  // The asset is gone → return to the (filtered) list the operator came from (Wave 3N.2).
  redirect(backHref(returnTo, "/dashboard/assets"));
}
