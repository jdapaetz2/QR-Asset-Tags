"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { normalizeAssetForm, type RawAssetForm } from "@/lib/assets/validate";

export type AssetFormState = { error?: string };

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

/** Update an asset the caller owns (RLS limits this to their own organization). */
export async function updateAsset(
  assetId: string,
  _prev: AssetFormState,
  formData: FormData
): Promise<AssetFormState> {
  await requireProfile();

  const result = normalizeAssetForm(readForm(formData));
  if (!result.value) return { error: result.error };

  const supabase = await createClient();
  // public_status is intentionally not updated here (publishing is Sprint 3).
  const { data, error } = await supabase
    .from("assets")
    .update(result.value)
    .eq("id", assetId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { error: "An asset with that code already exists." };
    }
    return { error: "Could not save changes. Please try again." };
  }
  if (!data) {
    // No row updated → not the caller's asset (or missing). RLS is the boundary.
    return { error: "Asset not found." };
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
