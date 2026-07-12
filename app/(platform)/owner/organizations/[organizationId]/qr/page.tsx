import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  QrGovernancePanel,
  type OwnerQrLink,
} from "@/components/owner/qr-governance-panel";

// Owner-only, reflects live QR governance state; never cache.
export const dynamic = "force-dynamic";

type QrRow = {
  id: string;
  asset_id: string;
  short_code: string;
  status: string;
  is_production_primary: boolean;
  supersedes_qr_link_id: string | null;
  last_scanned_at: string | null;
  created_at: string;
};

export default async function OwnerOrgQrPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await requireRole(ROLES.PLATFORM_OWNER);
  const { organizationId } = await params;

  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) notFound();

  const { data: assetData } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("asset_code", { ascending: true });
  const assets = (assetData ?? []) as {
    id: string;
    asset_code: string;
    asset_name: string;
  }[];

  const { data: qrData } = await supabase
    .from("qr_links")
    .select(
      "id, asset_id, short_code, status, is_production_primary, supersedes_qr_link_id, last_scanned_at, created_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  const qrRows = (qrData ?? []) as QrRow[];

  // Resolve supersedes lineage to the replaced code's short_code for display.
  const codeById = new Map<string, string>();
  for (const q of qrRows) codeById.set(q.id, q.short_code);

  const linksByAsset = new Map<string, OwnerQrLink[]>();
  for (const q of qrRows) {
    const link: OwnerQrLink = {
      id: q.id,
      shortCode: q.short_code,
      // Always the computed URL — never the stored qr_links.public_url.
      url: buildPublicQrUrl(publicEnv.siteUrl, q.short_code),
      status: q.status,
      isProductionPrimary: q.is_production_primary,
      supersedesCode: q.supersedes_qr_link_id
        ? codeById.get(q.supersedes_qr_link_id) ?? null
        : null,
      lastScannedAt: q.last_scanned_at,
      createdAt: q.created_at,
    };
    const list = linksByAsset.get(q.asset_id);
    if (list) list.push(link);
    else linksByAsset.set(q.asset_id, [link]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/owner/organizations/${organizationId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {org.name}
        </Link>
      </div>
      <PageHeader
        title="QR codes"
        description="Create a custom code, rotate to a replacement, and choose which code production prints. Existing codes keep working until you disable them."
      />
      {assets.length === 0 ? (
        <EmptyState
          title="No assets yet"
          description="This organization has no active assets to manage QR codes for."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {assets.map((a) => (
            <QrGovernancePanel
              key={a.id}
              assetId={a.id}
              assetCode={a.asset_code}
              baseUrl={publicEnv.siteUrl}
              links={linksByAsset.get(a.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
