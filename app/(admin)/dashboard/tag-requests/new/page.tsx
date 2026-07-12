import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import {
  TagRequestForm,
  type SelectableAsset,
} from "@/components/tag-request-form";

export const dynamic = "force-dynamic";

export default async function NewTagRequestPage() {
  await requireOrgId();
  const supabase = await createClient();

  // RLS-scoped, active assets only (archived are excluded from tag requests).
  const { data } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name, category")
    .is("archived_at", null)
    .order("asset_code", { ascending: true });
  const assets = (data ?? []) as SelectableAsset[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/tag-requests"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Tag requests
        </Link>
        <div className="mt-2">
          <PageHeader
            title="New tag request"
            description="Select the equipment that needs tags and choose the tag specs. AssetTag QR reviews, produces, and fulfills the physical tags."
          />
        </div>
      </div>

      <TagRequestForm assets={assets} />
    </div>
  );
}
