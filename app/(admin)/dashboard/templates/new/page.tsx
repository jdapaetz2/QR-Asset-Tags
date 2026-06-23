import Link from "next/link";

import { requireOrgId } from "@/lib/auth/session";
import { createOrgTemplate } from "@/lib/onboarding/org-templates-actions";
import { TemplateForm, type TemplateDefaults } from "@/components/template-form";
import {
  EQUIPMENT_TEMPLATES,
  TEMPLATE_META,
  isTemplateKey,
} from "@/lib/onboarding/templates";

type SearchParams = Promise<{ from?: string | string[] }>;

const BLANK: TemplateDefaults = {
  key: null,
  name: null,
  description: null,
  category: null,
  headline: null,
  quick_start_text: null,
  safety_notes: null,
  fuel_power_notes: null,
  return_notes: null,
  troubleshooting_notes: null,
  emergency_notes: null,
  is_active: true,
};

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireOrgId();
  const sp = await searchParams;
  const from = Array.isArray(sp.from) ? sp.from[0] : sp.from;

  // Optionally pre-fill content from a built-in template ("Copy & customize").
  // The key is left blank so the admin chooses their own (reusing a built-in key
  // intentionally overrides it for the org).
  let defaults = BLANK;
  if (from && isTemplateKey(from)) {
    const tpl = EQUIPMENT_TEMPLATES[from];
    const meta = TEMPLATE_META[from];
    defaults = {
      key: null,
      name: meta.name,
      description: meta.description,
      category: meta.equipmentType,
      headline: tpl.headline,
      quick_start_text: tpl.quick_start_text,
      safety_notes: tpl.safety_notes,
      fuel_power_notes: tpl.fuel_power_notes,
      return_notes: tpl.return_notes,
      troubleshooting_notes: tpl.troubleshooting_notes,
      emergency_notes: tpl.emergency_notes,
      is_active: true,
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard/templates"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Templates
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {from ? "Copy & customize template" : "New template"}
        </h1>
      </section>

      <TemplateForm
        action={createOrgTemplate}
        template={defaults}
        submitLabel="Create template"
      />
    </div>
  );
}
