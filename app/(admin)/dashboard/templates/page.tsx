import Link from "next/link";

import { requireOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  templateCatalog,
  TEMPLATE_VERIFY_NOTE,
} from "@/lib/onboarding/templates";

export const dynamic = "force-dynamic";

type OrgTemplateRow = {
  id: string;
  key: string;
  name: string;
  category: string | null;
  is_active: boolean;
};

export default async function TemplatesPage() {
  await requireOrgId();
  const supabase = await createClient();

  // RLS-scoped: only this organization's custom templates.
  const { data } = await supabase
    .from("equipment_page_templates")
    .select("id, key, name, category, is_active")
    .eq("is_system", false)
    .order("name", { ascending: true });
  const orgTemplates = (data ?? []) as OrgTemplateRow[];

  const builtIns = templateCatalog();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equipment templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable equipment-page content for CSV import.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/templates/new">New template</Link>
        </Button>
      </section>

      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
        {TEMPLATE_VERIFY_NOTE}
      </p>

      {/* Org custom templates */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Your organization templates
        </h2>
        {orgTemplates.length === 0 ? (
          <EmptyState
            title="No custom templates yet"
            description="Templates pre-fill equipment page content so onboarding new assets is fast. Create one, or copy a built-in template below to customize it."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Key</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Active</th>
                  <th className="px-4 py-2 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgTemplates.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{t.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {t.key}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {t.category ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {t.is_active ? "Yes" : "Archived"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/dashboard/templates/${t.id}`}
                        className="text-sm underline-offset-4 hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Built-in system templates */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Built-in templates (read-only)
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-4 py-2 font-medium">Equipment type</th>
                <th className="px-4 py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {builtIns.map((t) => (
                <tr key={t.key} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {t.key}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {t.equipmentType}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/dashboard/templates/new?from=${t.key}`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      Copy &amp; customize
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Built-in templates can&apos;t be edited.{" "}
          <Link
            href="/dashboard/assets/templates"
            className="underline-offset-4 hover:underline"
          >
            Preview full content
          </Link>{" "}
          in the catalog.
        </p>
      </section>
    </div>
  );
}
