import Link from "next/link";

import { requireOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  templateCatalog,
  TEMPLATE_FIELDS,
  TEMPLATE_VERIFY_NOTE,
} from "@/lib/onboarding/templates";

export const dynamic = "force-dynamic";

type OrgTemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  headline: string | null;
  quick_start_text: string | null;
  safety_notes: string | null;
  fuel_power_notes: string | null;
  return_notes: string | null;
  troubleshooting_notes: string | null;
  emergency_notes: string | null;
};

export default async function TemplateCatalogPage() {
  await requireOrgId();
  const catalog = templateCatalog();

  // This organization's custom templates (RLS-scoped), shown read-only here.
  const supabase = await createClient();
  const { data: orgData } = await supabase
    .from("equipment_page_templates")
    .select(
      "id, key, name, description, category, headline, quick_start_text, safety_notes, fuel_power_notes, return_notes, troubleshooting_notes, emergency_notes"
    )
    .eq("is_system", false)
    .order("name", { ascending: true });
  const orgTemplates = (orgData ?? []) as OrgTemplateRow[];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard/assets/import"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Import assets
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Equipment templates
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Built-in starter content for equipment pages. Copy a{" "}
          <code>template_key</code> into the <code>template_key</code> column of
          your import CSV to apply it.
        </p>
      </section>

      <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-muted-foreground">
        <h2 className="font-medium text-foreground">Before you publish</h2>
        <ul className="mt-2 list-disc pl-5">
          <li>Templates are starter content, not finished pages.</li>
          <li>
            Rental company staff must review and verify all instructions before
            publishing each page.
          </li>
          <li>
            Templates intentionally avoid detailed, safety-critical operating
            instructions.
          </li>
          <li>
            Equipment-specific manuals and manufacturer instructions still apply.
          </li>
        </ul>
        <p className="mt-2">{TEMPLATE_VERIFY_NOTE}</p>
      </section>

      {/* Organization custom templates */}
      {orgTemplates.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Your organization templates
            </h2>
            <Link
              href="/dashboard/templates"
              className="text-sm underline-offset-4 hover:underline"
            >
              Manage templates
            </Link>
          </div>
          {orgTemplates.map((tpl) => (
            <section key={tpl.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{tpl.name}</h3>
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {tpl.key}
                </code>
              </div>
              {tpl.category ? (
                <p className="mt-1 text-sm text-muted-foreground">{tpl.category}</p>
              ) : null}
              {tpl.description ? (
                <p className="mt-2 text-sm">{tpl.description}</p>
              ) : null}
              <dl className="mt-4 flex flex-col gap-3 border-t pt-4">
                {TEMPLATE_FIELDS.map((field) => (
                  <div key={field.key} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {field.label}
                    </dt>
                    <dd className="text-sm">
                      {tpl[field.key] ? (
                        <span className="whitespace-pre-line">{tpl[field.key]}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          Not used by this template
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </section>
      ) : null}

      <h2 className="text-sm font-medium text-muted-foreground">
        Built-in templates
      </h2>
      <div className="flex flex-col gap-6">
        {catalog.map((tpl) => (
          <section key={tpl.key} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{tpl.name}</h2>
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                {tpl.key}
              </code>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {tpl.equipmentType}
            </p>
            <p className="mt-2 text-sm">{tpl.description}</p>

            <dl className="mt-4 flex flex-col gap-3 border-t pt-4">
              {tpl.fields.map((field) => (
                <div key={field.label} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {field.label}
                  </dt>
                  <dd className="text-sm">
                    {field.value ? (
                      <span className="whitespace-pre-line">{field.value}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Not used by this template
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
