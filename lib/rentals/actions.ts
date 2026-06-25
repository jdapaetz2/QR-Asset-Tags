"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { isCloseStatus, normalizeRentalStart } from "@/lib/rentals/rentals";

export type RentalActionState = { error?: string };

/**
 * Start a rental session for one of the caller's own assets (RLS scopes every
 * write). organization_id comes from the profile, never user input. Rejects if the
 * asset already has an active session; the partial unique index is the backstop.
 * Keeps assets.active_rental_session_id in sync so the public page can prompt.
 */
export async function startRentalSession(
  assetId: string,
  _prev: RentalActionState,
  formData: FormData
): Promise<RentalActionState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const { rental_reference, renter_label } = normalizeRentalStart({
    rental_reference: formData.get("rental_reference")?.toString(),
    renter_label: formData.get("renter_label")?.toString(),
  });

  const supabase = await createClient();

  // RLS-scoped: another org's asset isn't returned → blocks cross-org changes.
  const { data: asset } = await supabase
    .from("assets")
    .select("id, active_rental_session_id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return { error: "Asset not found." };
  if (asset.active_rental_session_id) {
    return { error: "This asset already has an active rental session." };
  }

  const { data: session, error } = await supabase
    .from("asset_rental_sessions")
    .insert({
      organization_id: profile.organization_id,
      asset_id: assetId,
      status: "active",
      rental_reference,
      renter_label,
      created_by_profile_id: profile.id,
    })
    .select("id")
    .single();

  if (error || !session) {
    return { error: "Could not start the rental session." };
  }

  await supabase
    .from("assets")
    .update({ active_rental_session_id: session.id })
    .eq("id", assetId);

  redirect(`/dashboard/assets/${assetId}`);
}

/**
 * Close the active rental session — 'returned' or 'cancelled'. Stamps returned_at /
 * returned_by and clears the asset's active pointer. RLS scopes both writes.
 */
export async function closeRentalSession(
  assetId: string,
  sessionId: string,
  status: string,
  _prev: RentalActionState,
  _formData: FormData
): Promise<RentalActionState> {
  if (!isCloseStatus(status)) return { error: "Invalid status." };
  const profile = await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("asset_rental_sessions")
    .update({
      status,
      returned_at: new Date().toISOString(),
      returned_by_profile_id: profile.id,
    })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) return { error: "Could not update the rental session." };
  if (!data) return { error: "No active rental session found." };

  await supabase
    .from("assets")
    .update({ active_rental_session_id: null })
    .eq("id", assetId);

  redirect(`/dashboard/assets/${assetId}`);
}
