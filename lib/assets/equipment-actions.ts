"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import {
  normalizeEquipmentPageForm,
  EQUIPMENT_TEXT_FIELDS,
  type RawEquipmentForm,
} from "@/lib/assets/equipment";

export type EquipmentFormState = { error?: string };

function readForm(formData: FormData): RawEquipmentForm {
  const raw: RawEquipmentForm = {};
  for (const field of EQUIPMENT_TEXT_FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  const published = formData.get("is_published");
  raw.is_published = typeof published === "string" ? published : undefined;
  return raw;
}

/**
 * Create-or-update the equipment page for an asset the caller owns. `asset_id`
 * comes from the route and `organization_id` from the signed-in profile — never
 * from form input. RLS (`equipment_pages_rw`) is the real boundary.
 */
export async function saveEquipmentPage(
  assetId: string,
  _prev: EquipmentFormState,
  formData: FormData
): Promise<EquipmentFormState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const supabase = await createClient();

  // Confirm the asset is visible to the caller (RLS) before writing a page that
  // references it — blocks cross-org asset ids.
  const { data: asset } = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return { error: "Asset not found." };

  const { value } = normalizeEquipmentPageForm(readForm(formData));

  // Upsert on the unique asset_id: inserts if missing, updates otherwise.
  const { error } = await supabase.from("equipment_pages").upsert(
    {
      ...value,
      asset_id: assetId,
      organization_id: profile.organization_id,
    },
    { onConflict: "asset_id" }
  );

  if (error) {
    return { error: "Could not save the equipment page. Please try again." };
  }

  redirect(`/dashboard/assets/${assetId}/page`);
}
