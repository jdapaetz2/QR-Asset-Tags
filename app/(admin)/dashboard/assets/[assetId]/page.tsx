import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { updateAsset, setAssetPublicStatus } from "@/lib/assets/actions";
import { AssetForm } from "@/components/asset-form";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { QrLinkSection, type QrLinkRow } from "@/components/qr-link-section";

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={ok ? "text-foreground" : "text-muted-foreground"}
        aria-hidden
      >
        {ok ? "✓" : "✗"}
      </span>
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

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

  // RLS-scoped reads for status + QR management.
  const { data: page } = await supabase
    .from("equipment_pages")
    .select("is_published")
    .eq("asset_id", assetId)
    .maybeSingle();

  const { data: qrData } = await supabase
    .from("qr_links")
    .select("id, short_code, status, last_scanned_at, created_at")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: true });

  const links = (qrData ?? []) as QrLinkRow[];
  const isPublic = asset.public_status === "public";
  const pageStatus = !page ? "Missing" : page.is_published ? "Published" : "Draft";
  const hasLink = links.length > 0;
  const hasActiveLink = links.some((l) => l.status === "active");

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

      {/* Readiness checklist */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-medium">Public page readiness</h2>
        <ul className="flex flex-col gap-1">
          <Check ok={isPublic} label="Asset is public" />
          <Check ok={!!page} label="Equipment page exists" />
          <Check ok={!!page?.is_published} label="Equipment page is published" />
          <Check ok={hasLink} label="QR link exists" />
          <Check ok={hasActiveLink} label="QR link is active" />
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          The public scan page is live only when the asset is public, its equipment
          page is published, and a QR link is active.
        </p>
      </section>

      {/* Publish control */}
      <section className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="text-sm">
          <h2 className="font-medium">Visibility</h2>
          <p className="text-muted-foreground">
            This asset is {isPublic ? "public" : "private"}.
          </p>
        </div>
        <ActionButton
          action={setAssetPublicStatus.bind(
            null,
            assetId,
            isPublic ? "private" : "public"
          )}
          variant="outline"
        >
          {isPublic ? "Make private" : "Make public"}
        </ActionButton>
      </section>

      {/* Equipment page */}
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

      {/* QR link management */}
      <QrLinkSection assetId={assetId} links={links} />

      {/* Asset fields */}
      <AssetForm
        action={updateAsset.bind(null, assetId)}
        asset={asset}
        submitLabel="Save changes"
      />
    </div>
  );
}
