import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import {
  updateAsset,
  setAssetPublicStatus,
  archiveAsset,
  restoreAsset,
  deleteAsset,
} from "@/lib/assets/actions";
import { deleteEligibility } from "@/lib/assets/list";
import { getOrgCategories } from "@/lib/assets/categories";
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
      "asset_code, asset_name, category, make, model, serial_number, year, support_phone_override, support_email_override, cover_image_url, internal_notes, public_status, archived_at"
    )
    .eq("id", assetId)
    .maybeSingle();

  if (!asset) notFound();

  const categories = await getOrgCategories(supabase);

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
  const isArchived = Boolean(asset.archived_at);
  const pageStatus = !page ? "Missing" : page.is_published ? "Published" : "Draft";
  const hasLink = links.length > 0;
  const hasActiveLink = links.some((l) => l.status === "active");

  // Dependency counts decide whether a permanent delete is safe.
  const countRows = async (table: string): Promise<number> => {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId);
    return count ?? 0;
  };
  const [scansCount, submissionsCount, documentsCount, acknowledgementsCount] =
    await Promise.all([
      countRows("scan_events"),
      countRows("form_submissions"),
      countRows("documents"),
      countRows("asset_acknowledgements"),
    ]);
  const deleteCheck = deleteEligibility({
    qr: links.length,
    scans: scansCount,
    submissions: submissionsCount,
    documents: documentsCount,
    page: page ? 1 : 0,
  });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard/assets"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Assets
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {asset.asset_name}
          {isArchived ? (
            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-500">
              Archived
            </span>
          ) : null}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {asset.asset_code} · {asset.public_status}
        </p>
      </section>

      {/* Activity timeline */}
      <Link
        href={`/dashboard/assets/${assetId}/timeline`}
        className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 hover:bg-accent hover:text-accent-foreground"
      >
        <div>
          <h2 className="font-medium">Activity timeline</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Reports, checklists, acknowledgements, and tag history ·{" "}
            {submissionsCount} submission{submissionsCount === 1 ? "" : "s"} ·{" "}
            {acknowledgementsCount} acknowledgement
            {acknowledgementsCount === 1 ? "" : "s"}
          </p>
        </div>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
      </Link>

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

      {/* Documents */}
      <section className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="text-sm">
          <h2 className="font-medium">Documents</h2>
          <p className="text-muted-foreground">
            Manuals, guides, and links for this asset.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/assets/${assetId}/documents`}>
            Manage documents
          </Link>
        </Button>
      </section>

      {/* QR link management */}
      <QrLinkSection assetId={assetId} links={links} />

      {/* Asset fields (includes the unified cover-image section) */}
      <AssetForm
        action={updateAsset.bind(null, assetId)}
        asset={asset}
        assetId={assetId}
        categories={categories}
        submitLabel="Save changes"
      />

      {/* Lifecycle: archive (reversible) and permanent delete (safe only) */}
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="font-medium">Lifecycle</h2>
          <p className="text-sm text-muted-foreground">
            {isArchived
              ? "This asset is archived: hidden from active lists and its public page, but its QR links, scans, submissions, and documents are kept. Restore it any time."
              : "Archive hides the asset from active lists and its public page while keeping all history (QR links, scans, submissions, documents). Permanent delete is only for brand-new mistakes with no history — anything with QR links, scans, submissions, or documents should be archived, not deleted."}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {isArchived ? (
            <ActionButton action={restoreAsset.bind(null, assetId)} variant="outline">
              Restore
            </ActionButton>
          ) : (
            <ActionButton action={archiveAsset.bind(null, assetId)} variant="outline">
              Archive
            </ActionButton>
          )}
          {deleteCheck.canDelete ? (
            <ActionButton
              action={deleteAsset.bind(null, assetId)}
              variant="destructive"
              confirm="Permanently delete this asset? This cannot be undone."
            >
              Delete permanently
            </ActionButton>
          ) : (
            <p className="max-w-md text-xs text-muted-foreground">{deleteCheck.reason}</p>
          )}
        </div>
      </section>
    </div>
  );
}
