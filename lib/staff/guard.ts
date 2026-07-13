import "server-only";

import { notFound, redirect } from "next/navigation";

import { getProfile, type Profile } from "@/lib/auth/session";
import { landingPathForRole } from "@/lib/auth/policy";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff-scan access guard (Phase 3A). Resolves a QR short code to the caller's OWN-organization asset
 * through the RLS server client, so a cross-org or unknown short code is invisible → `notFound()`. An
 * unauthenticated visitor is bounced to `/login?next=/staff/t/<shortCode>` (login honors `next`), and a
 * user with no organization (platform_owner) is sent to their role landing. Returns the profile + the
 * asset needed by the staff summary and outbound flows.
 */

export type StaffAsset = {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string | null;
  cover_image_url: string | null;
  public_status: string;
  return_inspection_template_key: string | null;
  active_rental_session_id: string | null;
};

export type StaffAssetContext = {
  profile: Profile;
  organizationId: string;
  shortCode: string;
  asset: StaffAsset;
};

export async function requireStaffAssetByShortCode(
  shortCode: string
): Promise<StaffAssetContext> {
  const profile = await getProfile();
  if (!profile) {
    redirect(`/login?next=/staff/t/${encodeURIComponent(shortCode)}`);
  }
  if (!profile.organization_id) {
    // Platform owner (no org) has no staff workflow — send to their landing.
    redirect(landingPathForRole(profile.role));
  }

  const supabase = await createClient();

  // Resolve the short code via RLS: another org's (or unknown) code isn't returned → 404.
  const { data: link } = await supabase
    .from("qr_links")
    .select("asset_id")
    .eq("short_code", shortCode)
    .maybeSingle();
  if (!link) notFound();

  const { data: asset } = await supabase
    .from("assets")
    .select(
      "id, asset_code, asset_name, category, cover_image_url, public_status, return_inspection_template_key, active_rental_session_id"
    )
    .eq("id", link.asset_id)
    .maybeSingle<StaffAsset>();
  if (!asset) notFound();

  return {
    profile,
    organizationId: profile.organization_id,
    shortCode,
    asset,
  };
}
