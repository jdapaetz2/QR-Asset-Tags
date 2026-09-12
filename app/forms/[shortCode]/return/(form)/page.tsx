import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { resolveReturnTemplate } from "@/lib/inspections/resolve";
import { getAssetReturnTemplate } from "@/lib/inspections/org-templates-data";
import { ReturnInspectionForm } from "@/components/public/return-inspection-form";
import { ReturnChecklistNoScript } from "@/components/public/return-checklist-noscript";
import { resolveSupportContact } from "@/lib/public/equipment";
import { PublicFormLayout } from "@/components/public/public-form-layout";
import { UnavailableNotice } from "@/components/public/unavailable-notice";
import { getProfile } from "@/lib/auth/session";
import { resolveContactPrefill } from "@/lib/inspections/contact-prefill";

// Personalized (optional same-org contact prefill) → must never be shared-cached.
export const dynamic = "force-dynamic";

/**
 * Phase C6. The best-effort notification now runs in `after()`, which the Next.js docs scope to "the
 * platform's default or configured max duration of your route". The notification budget is 15 s
 * (NOTIFICATION_TOTAL_BUDGET_MS), so a platform default of 10 s would truncate a retrying send
 * mid-flight — a new failure mode created purely by deferring. This states the window explicitly
 * instead of inheriting whichever default the plan happens to carry.
 *
 * 60 s comfortably contains upload + insert (~1 s measured) plus the full 15 s notification budget.
 * The consequence of exhausting it is a lost EMAIL, never a lost submission: the row is committed and
 * the renter has been shown their confirmation long before the callback runs.
 */
export const maxDuration = 60;


export default async function ReturnInspectionPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = createPublicClient();

  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) return <UnavailableNotice />;

  // Template resolved server-side: assigned published custom template (RPC, published-only) → asset system
  // key → category suggestion → generic. The public route never reads the templates/defaults tables directly.
  const custom = resolved.returnInspectionTemplateId
    ? await getAssetReturnTemplate(supabase, resolved.assetId)
    : null;
  const template =
    custom?.definition ??
    resolveReturnTemplate({
      assignmentKey: resolved.returnInspectionTemplateKey,
      category: resolved.category,
    });

  // Optional convenience: a signed-in SAME-ORG admin/staff member gets their name + email pre-filled in the
  // optional contact section (server-derived; no extra client request; fields stay editable). getProfile reads
  // the auth cookie via the RLS client and returns null for anonymous/cross-org renters, so nothing leaks. The
  // submission origin is unchanged — this remains a public/renter return even when a staff member is signed in.
  const profile = await getProfile();
  const contactDefaults = resolveContactPrefill(profile, resolved.organizationId);

  return (
    <PublicFormLayout
      shortCode={shortCode}
      title="Return checklist"
      orgName={resolved.org.name ?? "Rental Equipment"}
      assetName={resolved.asset.asset_name}
      assetCode={resolved.asset.asset_code}
    >
      <ReturnChecklistNoScript
        shortCode={shortCode}
        orgName={resolved.org.name}
        brandColor={resolved.org.primary_color}
        contact={resolveSupportContact(resolved.asset, resolved.org)}
      />
      <ReturnInspectionForm
        template={template}
        shortCode={shortCode}
        contactDefaults={contactDefaults ?? undefined}
      />
    </PublicFormLayout>
  );
}
