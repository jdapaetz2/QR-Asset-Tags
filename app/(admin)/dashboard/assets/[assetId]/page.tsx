import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { updateAsset } from "@/lib/assets/actions";
import { AssetForm } from "@/components/asset-form";
import { Button } from "@/components/ui/button";

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

  // RLS-scoped: equipment page (if any) for this asset, for the status line.
  const { data: page } = await supabase
    .from("equipment_pages")
    .select("is_published")
    .eq("asset_id", assetId)
    .maybeSingle();

  const pageStatus = !page
    ? "Missing"
    : page.is_published
      ? "Published"
      : "Draft";

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

      <section className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="text-sm">
          <h2 className="font-medium">Equipment page</h2>
          <p className="text-muted-foreground">{pageStatus}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/assets/${assetId}/page`}>
            Edit equipment page
          </Link>
        </Button>
      </section>

      <AssetForm
        action={updateAsset.bind(null, assetId)}
        asset={asset}
        submitLabel="Save changes"
      />
    </div>
  );
}
