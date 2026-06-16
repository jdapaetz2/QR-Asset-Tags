import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { updateAsset } from "@/lib/assets/actions";
import { AssetForm } from "@/components/asset-form";

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  await requireOrgId();
  const { assetId } = await params;

  // RLS-scoped: a row from another organization simply isn't returned → 404.
  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("assets")
    .select(
      "asset_code, asset_name, category, make, model, serial_number, year, support_phone_override, support_email_override, internal_notes, public_status"
    )
    .eq("id", assetId)
    .maybeSingle();

  if (!asset) notFound();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard/assets"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Assets
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {asset.asset_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {asset.asset_code} · {asset.public_status}
        </p>
      </section>

      <AssetForm
        action={updateAsset.bind(null, assetId)}
        asset={asset}
        submitLabel="Save changes"
      />
    </div>
  );
}
