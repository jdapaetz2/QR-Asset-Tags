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
import { resolveReturnTemplateKey } from "@/lib/inspections/resolve";
import { getOrgCategoryDefaults } from "@/lib/inspections/category-defaults-data";
import {
  buildCategoryDefaultLookup,
  buildCategoryDefaultTargetLookup,
} from "@/lib/inspections/category-defaults";
import {
  getAssignableOrgTemplates,
  getOrgTemplate,
} from "@/lib/inspections/org-templates-data";
import { RETURN_TEMPLATE_PICKER } from "@/lib/inspections/templates";
import { buildSessionEvidenceHref } from "@/lib/rentals/evidence";
import { getOpenDamageForAsset } from "@/lib/submissions/damage-query";
import { sanitizeReturnTo, backHref } from "@/lib/nav/return-to";
import { AssetSubnav } from "@/components/assets/asset-subnav";
import { OpenDamageAlert } from "@/components/assets/open-damage-alert";
import { UNRESOLVED_STATUSES } from "@/lib/submissions/inbox";
import { AssetForm } from "@/components/asset-form";
import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { QrLinkSection, type QrLinkRow } from "@/components/qr-link-section";
import {
  RentalStatusForm,
  type ActiveRentalSession,
} from "@/components/rental-status-form";

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
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOrgId();
  const { assetId } = await params;
  const sp = await searchParams;
  // Originating (filtered) Assets-list URL to return to — validated to an internal dashboard path.
  const returnToRaw = Array.isArray(sp.returnTo) ? sp.returnTo[0] : sp.returnTo;
  const returnTo = sanitizeReturnTo(returnToRaw) ?? undefined;

  // RLS-scoped: a row from another organization simply isn't returned → 404.
  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("assets")
    .select(
      "asset_code, asset_name, category, make, model, serial_number, year, support_phone_override, support_email_override, cover_image_url, internal_notes, public_status, archived_at, return_inspection_template_key, return_inspection_template_id"
    )
    .eq("id", assetId)
    .maybeSingle();

  if (!asset) notFound();

  const categories = await getOrgCategories(supabase);
  const orgCategoryTargets = buildCategoryDefaultTargetLookup(
    await getOrgCategoryDefaults(supabase)
  );
  const orgTemplates = await getAssignableOrgTemplates(supabase);

  // Resolve the return-inspection summary. A custom (org) template assignment is shown from the DB row
  // (with its version + status); otherwise the code resolver (system key → org default → suggestion →
  // generic). Display-only; the authoritative assignment lives on the asset.
  const customTemplate = asset.return_inspection_template_id
    ? await getOrgTemplate(supabase, asset.return_inspection_template_id as string)
    : null;
  const orgCategoryDefaults = buildCategoryDefaultLookup(await getOrgCategoryDefaults(supabase));
  const returnResolution = resolveReturnTemplateKey({
    assignmentKey: asset.return_inspection_template_key as string | null,
    category: asset.category as string | null,
    categoryDefaults: orgCategoryDefaults,
  });
  const returnTemplate = RETURN_TEMPLATE_PICKER.find(
    (t) => t.key === returnResolution.key
  );

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

  // Active rental session (RLS-scoped). Drives the public acknowledgement prompt.
  const { data: rentalSession } = await supabase
    .from("asset_rental_sessions")
    .select("id, rental_reference, renter_label, started_at")
    .eq("asset_id", assetId)
    .eq("status", "active")
    .maybeSingle<ActiveRentalSession>();

  // Unresolved (new/reviewed) submissions on this asset — gates the pre-rent warning.
  const { count: unresolvedCount } = await supabase
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", assetId)
    .in("status", UNRESOLVED_STATUSES as readonly string[]);

  // Baseline (outbound) inspection for the active rental session, if any (Phase 3A).
  let baselineSubmissionId: string | null = null;
  if (rentalSession?.id) {
    const { data: baseline } = await supabase
      .from("form_submissions")
      .select("id")
      .eq("rental_session_id", rentalSession.id)
      .eq("form_type", "pre_use_inspection")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    baselineSubmissionId = baseline?.id ?? null;
  }

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
  const [scansCount, submissionsCount, documentsCount] = await Promise.all([
    countRows("scan_events"),
    countRows("form_submissions"),
    countRows("documents"),
  ]);
  const deleteCheck = deleteEligibility({
    qr: links.length,
    scans: scansCount,
    submissions: submissionsCount,
    documents: documentsCount,
    page: page ? 1 : 0,
  });

  // Open (unresolved) damage for this asset — one RLS-scoped filtered query (not per-asset N+1).
  const openDamage = await getOpenDamageForAsset(supabase, assetId);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href={backHref(returnTo, "/dashboard/assets")}
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
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <AssetTagChip code={asset.asset_code} />
          <span>{asset.public_status}</span>
        </div>
      </section>

      {/* Consistent per-asset sub-navigation (Wave 3N.2). Replaces the scattered Timeline / Rental-sessions
          links that used to live inline below — one canonical strip, preserving the Assets-list return context. */}
      <AssetSubnav assetId={assetId} current="overview" returnTo={returnTo} />

      {/* Open-damage alert — above the fold, only when unresolved damage exists (Phase 3C). */}
      {openDamage ? <OpenDamageAlert assetId={assetId} summary={openDamage} /> : null}

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
            isPublic ? "private" : "public",
            returnTo
          )}
          variant="outline"
        >
          {isPublic ? "Make private" : "Make public"}
        </ActionButton>
      </section>

      {/* Rental status */}
      <RentalStatusForm
        assetId={assetId}
        session={rentalSession ?? null}
        unresolvedCount={unresolvedCount ?? 0}
      />

      {baselineSubmissionId ? (
        <Link
          href={`/dashboard/submissions/${baselineSubmissionId}`}
          className="-mt-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View outbound baseline inspection →
        </Link>
      ) : null}

      {rentalSession?.id ? (
        <Link
          href={buildSessionEvidenceHref(rentalSession.id)}
          className="-mt-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View rental session evidence →
        </Link>
      ) : null}

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

      {/* Return inspection template */}
      <section className="rounded-lg border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-medium">Return inspection</h2>
            {customTemplate ? (
              <p className="text-muted-foreground">
                {customTemplate.name} · v{customTemplate.version} ·{" "}
                {customTemplate.status === "published"
                  ? "custom (published)"
                  : `custom (${customTemplate.status})`}
              </p>
            ) : (
              <p className="text-muted-foreground">
                {returnTemplate?.name}
                {returnResolution.source === "assigned"
                  ? " · assigned"
                  : returnResolution.source === "category_default"
                    ? " · organization category default"
                    : returnResolution.source === "suggested"
                      ? " · suggested from category"
                      : " · generic fallback"}
              </p>
            )}
          </div>
          <Button asChild variant="outline">
            <Link href="#return_inspection_template">Change template</Link>
          </Button>
        </div>
        {customTemplate && customTemplate.status !== "published" ? (
          <p className="mt-2 text-xs text-warning">
            This custom template version is {customTemplate.status}. Review this asset — reassign it to a
            published template or a system template.
          </p>
        ) : !customTemplate && returnResolution.source !== "assigned" ? (
          <p className="mt-2 text-xs text-warning">
            {returnResolution.source === "generic"
              ? "No specific template matched this category — using the generic inspection. Review recommended."
              : returnResolution.source === "category_default"
                ? "Using your organization category default. Save the asset to make it the explicit assignment."
                : "Suggested from the asset category. Save the asset to make it the explicit assignment."}
          </p>
        ) : null}
      </section>

      {/* QR link management */}
      <QrLinkSection assetId={assetId} links={links} />

      {/* Asset fields (includes the unified cover-image section) */}
      <AssetForm
        action={updateAsset.bind(null, assetId)}
        asset={asset}
        assetId={assetId}
        categories={categories}
        orgTemplates={orgTemplates}
        orgCategoryTargets={orgCategoryTargets}
        submitLabel="Save changes"
        cancelHref={backHref(returnTo, "/dashboard/assets")}
        returnTo={returnTo}
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
            <ActionButton action={restoreAsset.bind(null, assetId, returnTo)} variant="outline">
              Restore
            </ActionButton>
          ) : (
            <ActionButton action={archiveAsset.bind(null, assetId, returnTo)} variant="outline">
              Archive
            </ActionButton>
          )}
          {deleteCheck.canDelete ? (
            <ActionButton
              action={deleteAsset.bind(null, assetId, returnTo)}
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
