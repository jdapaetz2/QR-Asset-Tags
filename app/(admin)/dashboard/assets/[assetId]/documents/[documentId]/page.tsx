import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { updateDocument } from "@/lib/documents/actions";
import { DocumentForm } from "@/components/document-form";

type DocumentDetail = {
  title: string;
  document_type: string;
  visibility: string;
  url: string | null;
  storage_path: string | null;
  link_status: string;
};

export default async function EditDocumentPage({
  params,
}: {
  params: Promise<{ assetId: string; documentId: string }>;
}) {
  await requireOrgId();
  const { assetId, documentId } = await params;

  const supabase = await createClient();

  // RLS-scoped: a document from another organization isn't returned → 404.
  const { data } = await supabase
    .from("documents")
    .select("title, document_type, visibility, url, storage_path, link_status")
    .eq("id", documentId)
    .maybeSingle();
  if (!data) notFound();

  const doc = data as DocumentDetail;
  const isHosted = Boolean(doc.storage_path);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href={`/dashboard/assets/${assetId}/documents`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Documents
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit document</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isHosted ? "Hosted file" : "External link"}
        </p>
      </section>

      <DocumentForm
        action={updateDocument.bind(null, documentId)}
        submitLabel="Save changes"
        defaults={doc}
        showUrl={!isHosted}
        showFile={false}
        showLinkStatus
        cancelHref={`/dashboard/assets/${assetId}/documents`}
      />
    </div>
  );
}
