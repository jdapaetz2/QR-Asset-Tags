"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import {
  validateTagRequest,
  type RawTagRequestForm,
} from "@/lib/tags/tag-requests";

export type TagRequestState = { error?: string };

const FIELDS = ["material", "mounting_method", "tag_size", "quantity_notes"] as const;

function readForm(formData: FormData): RawTagRequestForm {
  const raw: RawTagRequestForm = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  return raw;
}

/**
 * Create a tag request for the caller's organization. organization_id and the
 * requester come from the profile (never form input). Only the caller's own,
 * non-archived assets are attached — archived/cross-org ids are dropped (RLS is
 * the boundary). No service-role.
 */
export async function createTagRequest(
  _prev: TagRequestState,
  formData: FormData
): Promise<TagRequestState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const result = validateTagRequest(readForm(formData));
  if (!result.value) return { error: result.error };

  const selectedIds = formData.getAll("select").filter((v): v is string => typeof v === "string");
  if (selectedIds.length === 0) {
    return { error: "Select at least one asset to request tags for." };
  }

  const supabase = await createClient();

  // Keep only the caller's own, active assets (RLS-scoped) → blocks archived/cross-org.
  const { data: assetRows } = await supabase
    .from("assets")
    .select("id")
    .in("id", selectedIds)
    .is("archived_at", null);
  const assetIds = (assetRows ?? []).map((a) => a.id as string);
  if (assetIds.length === 0) {
    return { error: "None of the selected assets are available for tag requests." };
  }

  const { data: request, error: insertError } = await supabase
    .from("tag_requests")
    .insert({
      organization_id: profile.organization_id,
      requested_by_profile_id: profile.id,
      status: "requested",
      material: result.value.material,
      mounting_method: result.value.mounting_method,
      tag_size: result.value.tag_size,
      quantity_notes: result.value.quantity_notes,
    })
    .select("id")
    .single();

  if (insertError || !request) {
    return { error: "Could not create the tag request. Please try again." };
  }

  const { error: childError } = await supabase.from("tag_request_assets").insert(
    assetIds.map((asset_id) => ({
      tag_request_id: request.id,
      asset_id,
      quantity: 1,
    }))
  );
  if (childError) {
    // Roll back the parent so we don't leave an empty request.
    await supabase.from("tag_requests").delete().eq("id", request.id);
    return { error: "Could not attach assets to the request. Please try again." };
  }

  redirect(`/dashboard/tag-requests/${request.id}`);
}
