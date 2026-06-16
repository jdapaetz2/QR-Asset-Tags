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

  // RLS-scoped: another org's asset isn't returned → 404.
  const { data: asset } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) notFound();

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
      />
    </div>
  );
}
