import { createPublicClient } from "@/lib/supabase/public";
import { recordScan } from "@/lib/scan/record";
import {
  PublicEquipmentPage,
  type PublicAsset,
  type PublicOrg,
  type PublicPage,
} from "@/components/public/public-equipment-page";
import { UnavailableNotice } from "@/components/public/unavailable-notice";

// Public, no-login page. Dynamic because each visit logs a scan and reads headers.
export const dynamic = "force-dynamic";

export default async function PublicScanPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = createPublicClient();

  // 1–2. Active QR link (anon RLS shows only status='active').
  const { data: link } = await supabase
    .from("qr_links")
    .select("id, asset_id, organization_id")
    .eq("short_code", shortCode)
    .maybeSingle();
  if (!link) return <UnavailableNotice />;

  // 3–4. Public asset — public-safe columns only (internal_notes is not granted
  // to anon). RLS shows only public_status='public'.
  const { data: asset } = await supabase
    .from("assets")
    .select(
      "asset_code, asset_name, category, make, model, cover_image_url, support_phone_override, support_email_override"
    )
    .eq("id", link.asset_id)
    .maybeSingle<PublicAsset>();
  if (!asset) return <UnavailableNotice />;

  // 5–6. Published equipment page (anon RLS shows only is_published=true of a
  // public asset).
  const { data: page } = await supabase
    .from("equipment_pages")
    .select(
      "headline, quick_start_text, safety_notes, fuel_power_notes, return_notes, troubleshooting_notes, emergency_notes"
    )
    .eq("asset_id", link.asset_id)
    .maybeSingle<PublicPage>();
  if (!page) return <UnavailableNotice />;

  // Org branding (anon RLS: active org, branding columns only — no billing).
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url, support_phone, support_email, powered_by_label")
    .eq("id", link.organization_id)
    .maybeSingle<NonNullable<PublicOrg>>();

  // 7. Best-effort scan log (never breaks rendering).
  await recordScan(supabase, {
    qrLinkId: link.id,
    assetId: link.asset_id,
    organizationId: link.organization_id,
  });

  // 8. Render.
  return (
    <PublicEquipmentPage
      shortCode={shortCode}
      asset={asset}
      page={page}
      org={org ?? null}
    />
  );
}
