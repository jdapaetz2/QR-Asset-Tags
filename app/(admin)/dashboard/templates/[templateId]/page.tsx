import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  updateOrgTemplate,
  setOrgTemplateActive,
} from "@/lib/onboarding/org-templates-actions";
import { TemplateForm, type TemplateDefaults } from "@/components/template-form";
import { ActionButton } from "@/components/action-button";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  await requireOrgId();
  const { templateId } = await params;
  const supabase = await createClient();

  // RLS-scoped; is_system=false guard prevents editing a built-in template, and a
  // cross-org row simply isn't returned → 404.
  const { data } = await supabase
    .from("equipment_page_templates")
    .select(
      "id, key, name, description, category, headline, quick_start_text, safety_notes, fuel_power_notes, return_notes, troubleshooting_notes, emergency_notes, is_active"
    )
    .eq("id", templateId)
    .eq("is_system", false)
    .maybeSingle();
  if (!data) notFound();

  const template = data as TemplateDefaults & { id: string; is_active: boolean };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/dashboard/templates"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Templates
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {template.name}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {template.key}
          </p>
        </div>
        <ActionButton
          action={setOrgTemplateActive.bind(
            null,
            templateId,
            !template.is_active
          )}
          variant="outline"
        >
          {template.is_active ? "Archive" : "Reactivate"}
        </ActionButton>
      </section>

      <TemplateForm
        action={updateOrgTemplate.bind(null, templateId)}
        template={template}
        submitLabel="Save template"
      />
    </div>
  );
}
