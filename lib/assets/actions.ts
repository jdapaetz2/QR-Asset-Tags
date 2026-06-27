"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { normalizeAssetForm, type RawAssetForm } from "@/lib/assets/validate";
import { deleteEligibility } from "@/lib/assets/list";
import {
  COVER_BUCKET,
  coverObjectName,
  coverPathPrefix,
  coverUrlForSave,
  managedCoverObjectPath,
  validateCoverFile,
} from "@/lib/assets/cover";

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
  const { data, error } = await supabase
    .from("assets")
    // organization_id comes from the profile, never from user input. RLS also
    // rejects any other org via the policy's WITH CHECK. public_status defaults
    // to 'private' (safe/unpublished) at the database level.
    .insert({ ...result.value, organization_id: profile.organization_id })
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
 * Update an asset the caller owns (RLS limits this to their own organization).
 * Single save flow: persists the text fields AND the cover image — either an
 * uploaded file (which wins over the URL field) or the validated URL/path, or
 * null to clear it.
 */
export async function updateAsset(
  assetId: string,
  _prev: AssetFormState,
  formData: FormData
): Promise<AssetFormState> {
  const profile = await requireProfile();

  const file = readCoverFile(formData);

  const raw = readForm(formData);
  // File wins: ignore the typed URL when a file is chosen (avoids stale-URL errors).
  raw.cover_image_url = coverUrlForSave({
    hasFile: Boolean(file),
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
  if (file && profile.organization_id) {
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

  redirect(`/dashboard/assets/${assetId}`);
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

  redirect(`/dashboard/assets/${assetId}`);
}

/** Archive (retire) an asset — hides it from the default list; history is kept. */
export async function archiveAsset(
  assetId: string,
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
  redirect(`/dashboard/assets/${assetId}`);
}

/** Restore an archived asset back to the active list. */
export async function restoreAsset(
  assetId: string,
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
  redirect(`/dashboard/assets/${assetId}`);
}

/**
 * Permanently delete an asset — ONLY when it has no dependent history. The check
 * is re-run server-side (never trust the UI). Anything with QR links, scans,
 * submissions, documents, or an equipment page must be archived instead. RLS
 * scopes everything to the caller's own organization.
 */
export async function deleteAsset(
  assetId: string,
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

  redirect("/dashboard/assets");
}
