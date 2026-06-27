import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { saveEquipmentPage } from "@/lib/assets/equipment-actions";
import { EquipmentPageForm } from "@/components/equipment-page-form";

export default async function EquipmentPageEditor({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  await requireOrgId();
  const { assetId } = await params;

  const supabase = await createClient();

  // RLS-scoped: another org's asset isn't returned → 404. Public-safe columns only
  // (the preview never shows internal_notes).
  const { data: asset } = await supabase
    .from("assets")
    .select(
      "id, asset_code, asset_name, category, cover_image_url, public_status, support_phone_override, support_email_override"
    )
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) notFound();

  // Org branding/support for the preview (own org via RLS).
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url, primary_color, support_phone, support_email")
    .maybeSingle();

  // First QR link for this asset → drives the "Open public page" link + readiness.
  const { data: qr } = await supabase
    .from("qr_links")
    .select("short_code, status")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: page } = await supabase
    .from("equipment_pages")
    .select(
      "headline, quick_start_text, safety_notes, fuel_power_notes, return_notes, troubleshooting_notes, emergency_notes, is_published"
    )
    .eq("asset_id", assetId)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href={`/dashboard/assets/${assetId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {asset.asset_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Equipment page
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {asset.asset_code} · {page ? (page.is_published ? "Published" : "Draft") : "Not created yet"}
        </p>
      </section>

      <EquipmentPageForm
        action={saveEquipmentPage.bind(null, assetId)}
        page={page ?? undefined}
        cancelHref={`/dashboard/assets/${assetId}`}
        org={{
          name: org?.name ?? null,
          logo_url: org?.logo_url ?? null,
          primary_color: org?.primary_color ?? null,
          support_phone: org?.support_phone ?? null,
          support_email: org?.support_email ?? null,
        }}
        asset={{
          asset_code: asset.asset_code,
          asset_name: asset.asset_name,
          category: asset.category,
          cover_image_url: asset.cover_image_url,
          public_status: asset.public_status,
          support_phone_override: asset.support_phone_override,
          support_email_override: asset.support_email_override,
        }}
        shortCode={qr?.short_code ?? null}
        hasActiveQr={qr?.status === "active"}
      />
    </div>
  );
}
