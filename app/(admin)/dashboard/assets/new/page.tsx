import Link from "next/link";

import { requireOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAsset } from "@/lib/assets/actions";
import { getOrgCategories } from "@/lib/assets/categories";
import { AssetForm } from "@/components/asset-form";

export default async function NewAssetPage() {
  await requireOrgId();
  const supabase = await createClient();
  const categories = await getOrgCategories(supabase);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard/assets"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Assets
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New asset</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          New assets start unpublished (private) until you publish them.
        </p>
      </section>

      <AssetForm
        action={createAsset}
        categories={categories}
        submitLabel="Create asset"
      />
    </div>
  );
}
