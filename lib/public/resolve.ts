import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PublicAsset,
  PublicPage,
} from "@/components/public/public-equipment-page";

/**
 * Shared public eligibility resolver for `/t/[shortCode]` and the public forms.
 * Uses the anon client so RLS does the gating: anon sees only active QR links,
 * public assets (public-safe columns; never internal_notes), published equipment
 * pages of public assets, and active organizations. Returns null if any step is
 * not publicly visible, so callers show the unavailable page / block submission.
 */

export type PublicOrgRecord = {
  name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  support_phone: string | null;
  support_email: string | null;
  powered_by_label: string | null;
};

export type ResolvedPublicEquipment = {
  organizationId: string;
  assetId: string;
  qrLinkId: string;
  asset: PublicAsset;
  page: PublicPage;
  org: PublicOrgRecord;
};

export async function resolvePublicEquipment(
  supabase: SupabaseClient,
  shortCode: string
): Promise<ResolvedPublicEquipment | null> {
  // Active QR link (anon RLS shows only status='active').
  const { data: link } = await supabase
    .from("qr_links")
    .select("id, asset_id, organization_id")
    .eq("short_code", shortCode)
    .maybeSingle();
  if (!link) return null;

  // Public asset — public-safe columns only (internal_notes is not granted to anon).
  const { data: asset } = await supabase
    .from("assets")
    .select(
      "asset_code, asset_name, category, make, model, cover_image_url, support_phone_override, support_email_override"
    )
    .eq("id", link.asset_id)
    .maybeSingle<PublicAsset>();
  if (!asset) return null;

  // Published equipment page (anon RLS shows only is_published=true of a public asset).
  const { data: page } = await supabase
    .from("equipment_pages")
    .select(
      "headline, quick_start_text, safety_notes, fuel_power_notes, return_notes, troubleshooting_notes, emergency_notes"
    )
    .eq("asset_id", link.asset_id)
    .maybeSingle<PublicPage>();
  if (!page) return null;

  // Organization branding (anon RLS: active org, branding columns only — no billing).
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, logo_url, primary_color, support_phone, support_email, powered_by_label"
    )
    .eq("id", link.organization_id)
    .maybeSingle<PublicOrgRecord>();
  if (!org) return null;

  return {
    organizationId: link.organization_id,
    assetId: link.asset_id,
    qrLinkId: link.id,
    asset,
    page,
    org,
  };
}
