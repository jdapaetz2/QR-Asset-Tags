import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrgTemplate } from "@/lib/inspections/org-templates-data";
import { OrgTemplateEditor } from "@/components/inspections/org-template-editor";

export const dynamic = "force-dynamic";

export default async function OrgTemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOrgId();
  const { id } = await params;

  const supabase = await createClient();
  const template = await getOrgTemplate(supabase, id);
  if (!template) notFound();

  const { count } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("return_inspection_template_id", id);

  // A newer published version of the same family (target for "Move assigned assets").
  const { data: familyRows } = await supabase
    .from("inspection_templates")
    .select("id, version, status")
    .eq("family_key", template.family_key);
  const newerPublished = (familyRows ?? [])
    .filter(
      (r) => (r as { status: string }).status === "published" && (r as { version: number }).version > template.version
    )
    .sort((a, b) => (b as { version: number }).version - (a as { version: number }).version)[0] as
    | { id: string; version: number }
    | undefined;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard/templates/return-inspections"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Return inspections
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Custom return template</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Copied from a system template and editable within limits. Only the approved field types and
          single-condition rules are allowed; the confirmation attestation cannot be removed. Publishing a
          version freezes it; editing later creates a new version.
        </p>
      </section>

      <OrgTemplateEditor
        id={template.id}
        status={template.status}
        version={template.version}
        initialName={template.name}
        initialDescription={template.description ?? ""}
        definition={template.definition_json}
        assignedCount={count ?? 0}
        moveToId={newerPublished?.id}
        moveToVersion={newerPublished?.version}
      />
    </div>
  );
}
