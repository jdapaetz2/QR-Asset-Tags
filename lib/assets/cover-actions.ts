"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import {
  COVER_BUCKET,
  coverObjectName,
  coverPathPrefix,
  managedCoverObjectPath,
  validateCoverFile,
} from "@/lib/assets/cover";

export type CoverFormState = { error?: string };

type UploadedFile = {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

function readFile(formData: FormData): UploadedFile | null {
  const entry = formData.get("file");
  if (typeof entry === "string" || !entry || entry.size === 0) return null;
  return entry;
}

/**
 * Upload a public cover image for an asset the caller owns. organization_id and
 * asset_id are derived server-side; RLS (DB + the public-assets `org/{id}/...`
 * write policy) is the boundary. No service-role.
 */
export async function uploadAssetCover(
  assetId: string,
  _prev: CoverFormState,
  formData: FormData
): Promise<CoverFormState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const file = readFile(formData);
  if (!file) return { error: "Choose an image to upload." };

  const fileError = validateCoverFile({ type: file.type, size: file.size });
  if (fileError) return { error: fileError };

  const supabase = await createClient();

  // RLS-scoped: another org's asset isn't returned → blocks cross-org uploads.
  const { data: asset } = await supabase
    .from("assets")
    .select("organization_id, cover_image_url")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return { error: "Asset not found." };

  const orgId = profile.organization_id;
  const path = `${coverPathPrefix(orgId, assetId)}/${coverObjectName(
    randomUUID(),
    file.type
  )}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(COVER_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { error: "Could not upload the image. Please try again." };
  }

  // Stable public URL (public bucket) — never a signed/expiring URL.
  const {
    data: { publicUrl },
  } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);

  const { data: updated, error: updateError } = await supabase
    .from("assets")
    .update({ cover_image_url: publicUrl })
    .eq("id", assetId)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    // Roll back the just-uploaded object so we don't orphan it.
    await supabase.storage.from(COVER_BUCKET).remove([path]);
    return { error: "Could not save the cover image. Please try again." };
  }

  // Best-effort: remove the previous app-managed object (never external URLs).
  const oldPath = managedCoverObjectPath(asset.cover_image_url, orgId, assetId);
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(COVER_BUCKET).remove([oldPath]);
  }

  redirect(`/dashboard/assets/${assetId}`);
}

/** Clear an asset's cover image (sets it null). Removes an app-managed object best-effort. */
export async function clearAssetCover(
  assetId: string,
  _prev: CoverFormState,
  _formData: FormData
): Promise<CoverFormState> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("assets")
    .select("organization_id, cover_image_url")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return { error: "Asset not found." };

  const { data: updated, error } = await supabase
    .from("assets")
    .update({ cover_image_url: null })
    .eq("id", assetId)
    .select("id")
    .maybeSingle();

  if (error || !updated) return { error: "Could not remove the cover image." };

  const orgId = profile.organization_id ?? asset.organization_id;
  const oldPath = managedCoverObjectPath(asset.cover_image_url, orgId, assetId);
  if (oldPath) {
    await supabase.storage.from(COVER_BUCKET).remove([oldPath]);
  }

  redirect(`/dashboard/assets/${assetId}`);
}
